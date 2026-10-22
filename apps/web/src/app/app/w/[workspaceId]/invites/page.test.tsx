import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  now: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("../../../../../supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: mocks.from }),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));
vi.mock("../../../../../env", () => ({
  getPublicEnv: () => ({ webUrl: "https://app.sitenote.test" }),
}));
vi.mock("../../../../../now", () => ({ currentTimeMs: mocks.now }));
vi.mock("../../../../../create-invite-form", () => ({
  CreateInviteForm: (props: { workspaceId: string }) => (
    <p data-testid="create-form">{props.workspaceId}</p>
  ),
}));
vi.mock("../../../../../invite-actions", () => ({ revokeInvite: vi.fn() }));

import InvitesPage from "./page";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const TOKEN = "b".repeat(48);
const USER = { id: "u-1", email: "owner@sitenote.test", isAnonymous: false };

interface Tables {
  membership: { data: unknown; error: unknown };
  invites: { data: unknown; error: unknown };
}

function resolving(result: unknown) {
  const chain: Record<string, unknown> = {
    eq: () => chain,
    order: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  return chain;
}

function useTables(tables: Tables) {
  mocks.from.mockImplementation((table: string) => ({
    select: () =>
      resolving(
        table === "profiles"
          ? { data: { display_name: "Olena Owner" }, error: null }
          : table === "members"
            ? tables.membership
            : tables.invites,
      ),
  }));
}

const OWNER_TABLES: Tables = {
  membership: { data: { role: "owner", workspaces: { name: "Northwind Studio" } }, error: null },
  invites: {
    data: [
      {
        id: "50000000-0000-4000-8000-000000000001",
        role: "guest",
        token: TOKEN,
        created_at: "2026-10-22T09:00:00Z",
        expires_at: "2026-10-29T09:00:00Z",
        revoked_at: null,
      },
      {
        id: "50000000-0000-4000-8000-000000000002",
        role: "member",
        token: "c".repeat(48),
        created_at: "2026-10-01T09:00:00Z",
        expires_at: "2026-10-08T09:00:00Z",
        revoked_at: null,
      },
      {
        id: "50000000-0000-4000-8000-000000000003",
        role: "guest",
        token: "d".repeat(48),
        created_at: "2026-10-20T09:00:00Z",
        expires_at: "2026-10-27T09:00:00Z",
        revoked_at: "2026-10-21T09:00:00Z",
      },
    ],
    error: null,
  },
};

async function renderPage(workspaceId = WORKSPACE_ID) {
  render(await InvitesPage({ params: Promise.resolve({ workspaceId }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue(USER);
  mocks.now.mockReturnValue(Date.parse("2026-10-22T12:00:00Z"));
  useTables(OWNER_TABLES);
});

describe("access", () => {
  it("answers 404 for a malformed workspace id", async () => {
    await expect(renderPage("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("sends a visitor without a session to sign-in and back", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow(
      `NEXT_REDIRECT /sign-in?next=${encodeURIComponent(`/app/w/${WORKSPACE_ID}/invites`)}`,
    );
  });

  it.each([["member"], ["guest"]])("answers 404 for a %s", async (role) => {
    useTables({
      ...OWNER_TABLES,
      membership: { data: { role, workspaces: { name: "X" } }, error: null },
    });

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("answers 404 for someone who is not in the workspace", async () => {
    useTables({ ...OWNER_TABLES, membership: { data: null, error: null } });

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("fails loudly instead of pretending the workspace does not exist when the lookup errors", async () => {
    useTables({ ...OWNER_TABLES, membership: { data: null, error: { message: "down" } } });

    await expect(renderPage()).rejects.toThrow("Could not read the workspace membership.");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});

describe("owner view", () => {
  it("shows the workspace, the create form and every invite with its status", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Invites for Northwind Studio" })).toBeTruthy();
    expect(screen.getByTestId("create-form").textContent).toBe(WORKSPACE_ID);
    const rows = screen.getAllByTestId("invite-row");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Guest invite"),
      expect.stringContaining("Member invite"),
      expect.stringContaining("Guest invite"),
    ]);
    expect(rows[0]?.textContent).toContain("Active");
    expect(rows[1]?.textContent).toContain("Expired");
    expect(rows[2]?.textContent).toContain("Revoked");
  });

  it("offers copy and revoke for the active invite only", async () => {
    await renderPage();

    expect(screen.getAllByRole("button", { name: "Copy link" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(1);
  });

  it("shows an empty state", async () => {
    useTables({ ...OWNER_TABLES, invites: { data: [], error: null } });

    await renderPage();

    expect(screen.getByText("No invites yet.")).toBeTruthy();
  });

  it("shows an error when the invites cannot be loaded", async () => {
    useTables({ ...OWNER_TABLES, invites: { data: null, error: { message: "down" } } });

    await renderPage();

    expect(screen.getByRole("alert").textContent).toContain("could not load the invites");
  });
});
