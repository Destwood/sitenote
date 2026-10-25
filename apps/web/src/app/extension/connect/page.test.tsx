import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../../supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({}),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));
vi.mock("../../../env", () => ({
  getPublicEnv: () => ({ extensionId: "abcdefghijklmnopabcdefghijklmnop" }),
}));
vi.mock("../../../extension-connect", () => ({
  ExtensionConnect: (props: { extensionId: string }) => (
    <p data-testid="connect">{props.extensionId}</p>
  ),
}));

import ExtensionConnectPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /extension/connect", () => {
  it.each([
    ["no session", null],
    ["a guest session", { id: "u-1", email: null, isAnonymous: true }],
  ])("sends %s to sign-in and back here", async (_label, user) => {
    mocks.getAuthenticatedUser.mockResolvedValue(user);

    await expect(ExtensionConnectPage()).rejects.toThrow(
      "NEXT_REDIRECT /sign-in?next=/extension/connect",
    );
  });

  it("shows the signed-in email and the connect action to a member", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({
      id: "u-2",
      email: "ada@example.com",
      isAnonymous: false,
    });

    render(await ExtensionConnectPage());

    expect(screen.getByRole("heading", { name: "Connect the extension" })).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
    expect(screen.getByText(/You stay signed in here\./)).toBeTruthy();
    expect(screen.getByTestId("connect").textContent).toBe("abcdefghijklmnopabcdefghijklmnop");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("offers a way to the dashboard from the top of the page", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({
      id: "u-3",
      email: "ada@example.com",
      isAnonymous: false,
    });

    render(await ExtensionConnectPage());

    expect(screen.getByRole("link", { name: "Go to dashboard" }).getAttribute("href")).toBe("/app");
  });
});
