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
vi.mock("../../../../../site-actions", () => ({ removeSite: vi.fn() }));

import SitesPage from "./page";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const USER = { id: "u-1", email: "owner@sitenote.test", isAnonymous: false };

function useSites(result: unknown) {
  mocks.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve(result),
      }),
    }),
  }));
}

async function renderPage(workspaceId = WORKSPACE_ID) {
  render(await SitesPage({ params: Promise.resolve({ workspaceId }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue(USER);
  mocks.readWorkspaceAccess.mockResolvedValue({ name: "Northwind", role: "owner" });
  useSites({
    data: [
      { id: "s-1", origin: "https://example.test", threads: [{ count: 3 }] },
      { id: "s-2", origin: "http://127.0.0.1:4173", threads: [] },
    ],
    error: null,
  });
});

describe("SitesPage", () => {
  it("answers 404 for a malformed workspace id", async () => {
    await expect(renderPage("nope")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("answers 404 for a user who is not in the workspace", async () => {
    mocks.readWorkspaceAccess.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lists the sites with their thread counts and lets the owner remove them", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Sites" })).toBeTruthy();
    expect(screen.getByText("https://example.test")).toBeTruthy();
    expect(screen.getByText("3 threads")).toBeTruthy();
    expect(screen.getByText("0 threads")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Remove site" })).toHaveLength(2);
  });

  it("hides removal from a member", async () => {
    mocks.readWorkspaceAccess.mockResolvedValue({ name: "Northwind", role: "member" });

    await renderPage();

    expect(screen.queryByRole("button", { name: "Remove site" })).toBeNull();
    expect(screen.getByText("https://example.test")).toBeTruthy();
  });

  it("fails loudly when the sites cannot be read", async () => {
    useSites({ data: null, error: { message: "down" } });

    await expect(renderPage()).rejects.toThrow("Could not read the sites.");
  });
});
