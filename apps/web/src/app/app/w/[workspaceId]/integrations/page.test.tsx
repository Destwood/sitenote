import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  readWorkspaceAccess: vi.fn(),
  form: vi.fn<(props: unknown) => null>(() => null),
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
vi.mock("../../../../../clickup-integration-form", () => ({
  ClickUpIntegrationForm: mocks.form,
}));

import IntegrationsPage from "./page";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const USER = { id: "u-1", email: "owner@sitenote.test", isAnonymous: false };

function useIntegration(result: unknown) {
  mocks.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(result),
        }),
      }),
    }),
  }));
}

async function renderPage(workspaceId = WORKSPACE_ID) {
  render(await IntegrationsPage({ params: Promise.resolve({ workspaceId }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue(USER);
  mocks.readWorkspaceAccess.mockResolvedValue({ name: "Northwind", role: "owner" });
  useIntegration({ data: null, error: null });
});

describe("IntegrationsPage", () => {
  it("answers 404 for an invalid workspace id", async () => {
    await expect(renderPage("nope")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sends a signed-out visitor to sign in", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT");
  });

  it.each(["member", "guest"] as const)("answers 404 for a %s", async (role) => {
    mocks.readWorkspaceAccess.mockResolvedValue({ name: "Northwind", role });

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("offers the connection form without a stored integration", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Integrations" })).toBeTruthy();
    expect(mocks.form.mock.calls[0]?.[0]).toEqual({ workspaceId: WORKSPACE_ID, connection: null });
  });

  it("passes the names of the connected list to the form and never the token", async () => {
    useIntegration({
      data: {
        settings: {
          teamId: "1",
          teamName: "Studio",
          spaceId: "2",
          spaceName: "Web",
          listId: "789",
          listName: "Bugs",
        },
      },
      error: null,
    });

    await renderPage();

    expect(mocks.form.mock.calls[0]?.[0]).toEqual({
      workspaceId: WORKSPACE_ID,
      connection: { teamName: "Studio", spaceName: "Web", listName: "Bugs" },
    });
    expect(document.body.textContent).not.toContain("pk_");
  });

  it("reports a failed read instead of showing an empty form", async () => {
    useIntegration({ data: null, error: { message: "denied" } });

    await expect(renderPage()).rejects.toThrow("Could not read the integrations.");
  });
});
