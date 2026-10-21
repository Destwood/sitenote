import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success } from "../messages";
import { AccountPanel } from ".";

const mocks = vi.hoisted(() => ({ sendMessage: vi.fn() }));

vi.mock("../message-client", () => ({ sendMessage: mocks.sendMessage }));

const USER = { id: "u", email: "max@sitenote.test", displayName: "Max Member", isAnonymous: false };

beforeEach(() => {
  mocks.sendMessage.mockReset();
});

describe("AccountPanel", () => {
  it("shows the display name, the email and the initial", () => {
    render(<AccountPanel user={USER} onSignedOut={vi.fn()} />);

    expect(screen.getByTestId("display-name").textContent).toContain("Max Member");
    expect(screen.getByTestId("account-email").textContent).toContain("max@sitenote.test");
    expect(screen.getByText("M")).toBeTruthy();
  });

  it("labels a user without an email as a guest session", () => {
    render(
      <AccountPanel
        user={{ ...USER, email: null, displayName: "Guest", isAnonymous: true }}
        onSignedOut={vi.fn()}
      />,
    );

    expect(screen.getByTestId("account-email").textContent).toContain("Guest session");
  });

  it("uppercases the first character of an accented name", () => {
    render(<AccountPanel user={{ ...USER, displayName: "  élan" }} onSignedOut={vi.fn()} />);

    expect(screen.getByText("É")).toBeTruthy();
  });

  it("signs out and reports the new state", async () => {
    const user = userEvent.setup();
    const onSignedOut = vi.fn();
    mocks.sendMessage.mockResolvedValueOnce(success({ status: "signedOut" }));
    render(<AccountPanel user={USER} onSignedOut={onSignedOut} />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await vi.waitFor(() => {
      expect(onSignedOut).toHaveBeenCalledExactlyOnceWith({ status: "signedOut" });
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "auth.signOut" });
  });

  it("shows a fixed message when signing out fails", async () => {
    const user = userEvent.setup();
    const onSignedOut = vi.fn();
    mocks.sendMessage.mockResolvedValueOnce(failure("sign_out_failed"));
    render(<AccountPanel user={USER} onSignedOut={onSignedOut} />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect((await screen.findByRole("alert")).textContent).toContain("could not sign you out");
    expect(onSignedOut).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveProperty("disabled", false);
  });

  it("renders a name as text and never as markup", () => {
    render(
      <AccountPanel
        user={{ ...USER, displayName: "<img src=x onerror=alert(1)>" }}
        onSignedOut={vi.fn()}
      />,
    );

    expect(screen.getByTestId("display-name").textContent).toContain(
      "<img src=x onerror=alert(1)>",
    );
    expect(document.querySelector("img")).toBeNull();
  });
});
