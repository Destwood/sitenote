import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  readWorkspaceAccess: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("../../../../../supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: mocks.from }),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));
vi.mock("../../../../../workspace-access", () => ({
  readWorkspaceAccess: mocks.readWorkspaceAccess,
}));
vi.mock("../../../../../member-actions", () => ({
  setMemberRole: vi.fn(),
  removeMember: vi.fn(),
  leaveWorkspace: vi.fn(),
}));

import MembersPage from "./page";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const USER = { id: "u-2", email: "max@sitenote.test", isAnonymous: false };

const MEMBER_ROWS = [
  {
    user_id: "u-1",
    role: "owner",
    created_at: "2026-10-01T09:00:00Z",
    profiles: { display_name: "Olena" },
  },
  {
    user_id: "u-2",
    role: "member",
    created_at: "2026-10-02T09:00:00Z",
    profiles: { display_name: "Max" },
  },
];

async function renderPage(workspaceId = WORKSPACE_ID) {
  render(await MembersPage({ params: Promise.resolve({ workspaceId }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue(USER);
  mocks.readWorkspaceAccess.mockResolvedValue({ name: "Northwind", role: "member" });
  mocks.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve({ data: MEMBER_ROWS, error: null }),
      }),
    }),
  }));
});

describe("MembersPage", () => {
  it("answers 404 for a malformed workspace id", async () => {
    await expect(renderPage("nope")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("answers 404 for a user who is not in the workspace", async () => {
    mocks.readWorkspaceAccess.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lists the members and offers a member only to leave", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Members" })).toBeTruthy();
    expect(screen.getByText("Olena", { exact: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Leave workspace" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save role" })).toBeNull();
  });

  it("lets the owner manage the other members", async () => {
    mocks.readWorkspaceAccess.mockResolvedValue({ name: "Northwind", role: "owner" });

    await renderPage();

    expect(screen.getByRole("button", { name: "Save role" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove from workspace" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Leave workspace" })).toBeNull();
  });

  it("fails loudly when the members cannot be read", async () => {
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: null, error: { message: "down" } }),
        }),
      }),
    }));

    await expect(renderPage()).rejects.toThrow("Could not read the workspace members.");
  });
});
