import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  readMemberships: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../../supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({}),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));
vi.mock("../../../workspace-access", () => ({ readMemberships: mocks.readMemberships }));

import DashboardPage from "./page";

const SIGNED_IN = { id: "u-1", email: "owner@sitenote.test", isAnonymous: false };

const WORKSPACE_A = { id: "10000000-0000-4000-8000-000000000001", name: "Alpha", role: "owner" };
const WORKSPACE_B = { id: "10000000-0000-4000-8000-000000000002", name: "Beta", role: "member" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue(SIGNED_IN);
});

describe("GET /app/dashboard", () => {
  it("sends a visitor without a session to sign-in and back here", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT /sign-in?next=/app/dashboard");
    expect(mocks.readMemberships).not.toHaveBeenCalled();
  });

  it("opens the only workspace's threads", async () => {
    mocks.readMemberships.mockResolvedValue([WORKSPACE_A]);

    await expect(DashboardPage()).rejects.toThrow(`NEXT_REDIRECT /app/w/${WORKSPACE_A.id}/threads`);
    expect(mocks.readMemberships).toHaveBeenCalledWith(expect.anything(), SIGNED_IN.id);
  });

  it("opens the first of several workspaces", async () => {
    mocks.readMemberships.mockResolvedValue([WORKSPACE_A, WORKSPACE_B]);

    await expect(DashboardPage()).rejects.toThrow(`NEXT_REDIRECT /app/w/${WORKSPACE_A.id}/threads`);
  });

  it("sends a user with no workspaces to the workspace list", async () => {
    mocks.readMemberships.mockResolvedValue([]);

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT /app");
  });

  it("sends a user to the workspace list when memberships cannot be read", async () => {
    mocks.readMemberships.mockResolvedValue(null);

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT /app");
  });
});
