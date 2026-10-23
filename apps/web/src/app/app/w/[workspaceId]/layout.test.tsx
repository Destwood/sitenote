import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  readMemberships: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("../../../../supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: mocks.from }),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));
vi.mock("../../../../workspace-access", () => ({ readMemberships: mocks.readMemberships }));
vi.mock("../../../../workspace-switcher", () => ({
  WorkspaceSwitcher: (props: { currentId: string }) => (
    <p data-testid="switcher">{props.currentId}</p>
  ),
}));

import WorkspaceLayout from "./layout";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const USER = { id: "u-1", email: "owner@sitenote.test", isAnonymous: false };
const MEMBERSHIPS = [{ id: WORKSPACE_ID, name: "Northwind Studio", role: "owner" }];

async function renderLayout(workspaceId = WORKSPACE_ID) {
  render(
    await WorkspaceLayout({
      children: <p>Workspace body</p>,
      params: Promise.resolve({ workspaceId }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue(USER);
  mocks.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { display_name: "Olena Owner" }, error: null }),
      }),
    }),
  }));
  mocks.readMemberships.mockResolvedValue(MEMBERSHIPS);
});

describe("access", () => {
  it("answers 404 for a malformed workspace id", async () => {
    await expect(renderLayout("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.readMemberships).not.toHaveBeenCalled();
  });

  it("leaves the sign-in redirect to the page, so it keeps the requested path", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    await renderLayout();

    expect(screen.getByText("Workspace body")).toBeTruthy();
    expect(screen.queryByTestId("switcher")).toBeNull();
    expect(mocks.readMemberships).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("answers 404 for a user who is not in the workspace", async () => {
    mocks.readMemberships.mockResolvedValue([]);

    await expect(renderLayout()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("fails loudly when the memberships cannot be read", async () => {
    mocks.readMemberships.mockResolvedValue(null);

    await expect(renderLayout()).rejects.toThrow("Could not read your workspaces.");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});

describe("frame", () => {
  it("renders the header, the switcher, the owner navigation and the page", async () => {
    await renderLayout();

    expect(screen.getByTestId("display-name").textContent).toBe("Olena Owner");
    expect(screen.getByTestId("switcher").textContent).toBe(WORKSPACE_ID);
    expect(screen.getByRole("link", { name: "Invites" })).toBeTruthy();
    expect(screen.getByText("Workspace body")).toBeTruthy();
  });
});
