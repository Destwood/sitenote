import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type AuthState } from "../messages";
import { failure, success } from "@sitenote/widget";
import { SignInPanel } from ".";

const mocks = vi.hoisted(() => ({ sendMessage: vi.fn(), tabsCreate: vi.fn() }));

vi.mock("../message-client", () => ({ sendMessage: mocks.sendMessage }));
vi.mock("wxt/browser", () => ({ browser: { tabs: { create: mocks.tabsCreate } } }));

const WEB_URL = "https://app.sitenote.test";

const SIGNED_IN: AuthState = {
  status: "signedIn",
  user: { id: "u", email: "a@b.test", displayName: "Ann", isAnonymous: false },
};

function renderPanel(options: { googleEnabled?: boolean } = {}) {
  const onSignedIn = vi.fn();
  render(
    <SignInPanel
      googleEnabled={options.googleEnabled ?? false}
      webUrl={WEB_URL}
      onSignedIn={onSignedIn}
    />,
  );
  return { onSignedIn };
}

beforeEach(() => {
  mocks.sendMessage.mockReset();
  mocks.tabsCreate.mockReset();
  localStorage.clear();
});

describe("SignInPanel", () => {
  it("explains that the website connects the extension", () => {
    renderPanel();

    expect(screen.getByText("Sign in on the website to connect the extension.")).toBeTruthy();
  });

  it("renders no email textbox", () => {
    renderPanel();

    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("opens the connect page on the website in a new tab", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Sign in on the website" }));

    expect(mocks.tabsCreate).toHaveBeenCalledWith({
      url: "https://app.sitenote.test/extension/connect",
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("hides the Google button when the flag is off", () => {
    renderPanel({ googleEnabled: false });

    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
  });

  it("signs in with Google when the flag is on", async () => {
    const user = userEvent.setup();
    const { onSignedIn } = renderPanel({ googleEnabled: true });
    mocks.sendMessage.mockResolvedValueOnce(success(SIGNED_IN));

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    await vi.waitFor(() => {
      expect(onSignedIn).toHaveBeenCalledExactlyOnceWith(SIGNED_IN);
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "auth.signInWithGoogle" });
  });

  it("shows a fixed message when Google sign-in is cancelled", async () => {
    const user = userEvent.setup();
    renderPanel({ googleEnabled: true });
    mocks.sendMessage.mockResolvedValueOnce(failure("google_cancelled"));

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect((await screen.findByRole("alert")).textContent).toContain("cancelled");
  });
});
