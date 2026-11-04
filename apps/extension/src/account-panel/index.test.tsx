import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success } from "@sitenote/widget";
import { AccountPanel, initialOf } from ".";

const mocks = vi.hoisted(() => ({ sendMessage: vi.fn() }));

vi.mock("../message-client", () => ({ sendMessage: mocks.sendMessage }));

const USER = { id: "u", email: "max@sitenote.test", displayName: "Max Member", isAnonymous: false };

beforeEach(() => {
  mocks.sendMessage.mockReset();
});

describe("initialOf", () => {
  it("uppercases the first character of an accented name", () => {
    expect(initialOf("  élan")).toBe("É");
  });

  it("falls back to a question mark for an empty name", () => {
    expect(initialOf("   ")).toBe("?");
  });
});

describe("AccountPanel", () => {
  it("shows the display name with the email as its tooltip and as small text", () => {
    render(<AccountPanel user={USER} onSignedOut={vi.fn()} />);

    const name = screen.getByTestId("display-name");
    expect(name.textContent).toBe("Max Member");
    expect(name.getAttribute("title")).toBe("max@sitenote.test");
    expect(screen.getByText("max@sitenote.test")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("M")).toBeTruthy();
  });

  it("labels a user without an email as a guest session", () => {
    render(
      <AccountPanel
        user={{ ...USER, email: null, displayName: "Guest", isAnonymous: true }}
        onSignedOut={vi.fn()}
      />,
    );

    expect(screen.getByTestId("display-name").getAttribute("title")).toBe("Guest session");
    expect(screen.queryByText("max@sitenote.test")).toBeNull();
  });

  it("offers only sign out, with no account settings", () => {
    render(<AccountPanel user={USER} onSignedOut={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Account settings" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
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

  it("shows the signing out label while the request is pending", async () => {
    const user = userEvent.setup();
    let answer: (value: unknown) => void = () => undefined;
    mocks.sendMessage.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    render(<AccountPanel user={USER} onSignedOut={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.getByRole("button", { name: "Signing out..." })).toHaveProperty("disabled", true);
    answer(success({ status: "signedOut" }));
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
