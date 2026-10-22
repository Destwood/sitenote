import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("../../../supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ rpc: mocks.rpc }),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));
vi.mock("../../../env", () => ({
  getPublicEnv: () => ({ extensionId: "abcdefghijklmnopabcdefghijklmnop" }),
}));
vi.mock("../../../guest-join", () => ({
  GuestJoin: (props: { token: string; workspaceName: string; extensionId: string }) => (
    <p data-testid="guest-join">{`${props.workspaceName}|${props.token}|${props.extensionId}`}</p>
  ),
}));
vi.mock("../../../accept-invite-form", () => ({
  AcceptInviteForm: (props: { token: string; workspaceName: string; role: string }) => (
    <p data-testid="accept-invite">{`${props.workspaceName}|${props.role}|${props.token}`}</p>
  ),
}));

import InvitePage from "./page";

const TOKEN = "a".repeat(48);
const MEMBER_USER = { id: "u-1", email: "max@sitenote.test", isAnonymous: false };
const GUEST_USER = { id: "u-2", email: null, isAnonymous: true };

function preview(role: "member" | "guest", valid = true) {
  return {
    data: [
      valid
        ? { workspace_name: "Northwind Studio", role, expires_at: "2026-11-01T00:00:00Z", valid }
        : { workspace_name: null, role: null, expires_at: null, valid },
    ],
    error: null,
  };
}

async function renderPage(token = TOKEN) {
  render(await InvitePage({ params: Promise.resolve({ token }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue(null);
  mocks.rpc.mockResolvedValue(preview("guest"));
});

describe("invalid links", () => {
  it("shows the invalid message for a token the database does not know", async () => {
    mocks.rpc.mockResolvedValue(preview("guest", false));

    await renderPage();

    expect(screen.getByRole("alert").textContent).toBe(
      "This invite link is invalid or has expired.",
    );
    expect(screen.queryByTestId("guest-join")).toBeNull();
  });

  it("shows the invalid message without a database call for a malformed token", async () => {
    await renderPage("not a token");

    expect(screen.getByRole("alert").textContent).toBe(
      "This invite link is invalid or has expired.",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("shows the invalid message when the preview has no row", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await renderPage();

    expect(screen.getByRole("alert").textContent).toBe(
      "This invite link is invalid or has expired.",
    );
  });

  it("asks for a reload when the preview fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    await renderPage();

    expect(screen.getByRole("alert").textContent).toContain("Reload the page");
  });
});

describe("guest invites", () => {
  it("shows the guest form to a visitor without a session", async () => {
    await renderPage();

    expect(mocks.rpc).toHaveBeenCalledWith("invite_preview", { p_token: TOKEN });
    expect(screen.getByTestId("guest-join").textContent).toBe(
      `Northwind Studio|${TOKEN}|abcdefghijklmnopabcdefghijklmnop`,
    );
  });

  it("shows the guest form to a visitor who already has a guest session", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(GUEST_USER);

    await renderPage();

    expect(screen.getByTestId("guest-join")).toBeTruthy();
  });

  it("offers a signed-in member the plain accept button", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(MEMBER_USER);

    await renderPage();

    expect(screen.getByTestId("accept-invite").textContent).toBe(`Northwind Studio|guest|${TOKEN}`);
    expect(screen.queryByTestId("guest-join")).toBeNull();
  });
});

describe("member invites", () => {
  beforeEach(() => {
    mocks.rpc.mockResolvedValue(preview("member"));
  });

  it("sends a visitor to sign in and back to the invite", async () => {
    await renderPage();

    const link = screen.getByRole("link", { name: "Sign in to join" });
    expect(link.getAttribute("href")).toBe(`/sign-in?next=%2Finvite%2F${TOKEN}`);
    expect(screen.queryByTestId("guest-join")).toBeNull();
  });

  it("does not offer a guest session the member invite", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(GUEST_USER);

    await renderPage();

    expect(screen.getByRole("link", { name: "Sign in to join" })).toBeTruthy();
    expect(screen.queryByTestId("guest-join")).toBeNull();
    expect(screen.queryByTestId("accept-invite")).toBeNull();
  });

  it("offers a signed-in member the accept button", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(MEMBER_USER);

    await renderPage();

    expect(screen.getByTestId("accept-invite").textContent).toBe(
      `Northwind Studio|member|${TOKEN}`,
    );
  });
});
