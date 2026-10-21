import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success, type AuthState } from "../messages";
import { readPendingSignIn, savePendingSignIn } from "../pending-sign-in";
import { RESEND_DELAY_SECONDS, SignInPanel } from ".";

const mocks = vi.hoisted(() => ({ sendMessage: vi.fn() }));

vi.mock("../message-client", () => ({ sendMessage: mocks.sendMessage }));

const SIGNED_IN: AuthState = {
  status: "signedIn",
  user: { id: "u", email: "a@b.test", displayName: "Ann", isAnonymous: false },
};

function renderPanel(options: { googleEnabled?: boolean } = {}) {
  const onSignedIn = vi.fn();
  render(<SignInPanel googleEnabled={options.googleEnabled ?? false} onSignedIn={onSignedIn} />);
  return { onSignedIn };
}

async function reachCodeStep(user: ReturnType<typeof userEvent.setup>) {
  mocks.sendMessage.mockResolvedValueOnce(success(null));
  await user.type(screen.getByLabelText("Email"), "a@b.test");
  await user.click(screen.getByRole("button", { name: "Email me a code" }));
  await screen.findByLabelText("6-digit code");
}

beforeEach(() => {
  mocks.sendMessage.mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SignInPanel", () => {
  it("asks for the email first and requests a code", async () => {
    const user = userEvent.setup();
    renderPanel();

    await reachCodeStep(user);

    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "auth.sendCode", email: "a@b.test" });
    expect(screen.getByRole("status").textContent).toContain("a@b.test");
    expect(readPendingSignIn(Date.now())?.email).toBe("a@b.test");
  });

  it("shows a fixed message when the code cannot be sent and stays on the email step", async () => {
    const user = userEvent.setup();
    renderPanel();
    mocks.sendMessage.mockResolvedValueOnce(failure("rate_limited"));

    await user.type(screen.getByLabelText("Email"), "a@b.test");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Too many attempts");
    expect(screen.getByLabelText("Email")).toHaveProperty("value", "a@b.test");
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
  });

  it("uses a numeric one-time-code field that keeps only six digits", async () => {
    const user = userEvent.setup();
    renderPanel();
    await reachCodeStep(user);

    const input = screen.getByLabelText("6-digit code");
    await user.type(input, "12ab34567");

    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input).toHaveProperty("value", "123456");
  });

  it("keeps verification disabled until six digits are typed", async () => {
    const user = userEvent.setup();
    renderPanel();
    await reachCodeStep(user);

    await user.type(screen.getByLabelText("6-digit code"), "12345");
    expect(screen.getByRole("button", { name: "Verify code" })).toHaveProperty("disabled", true);

    await user.type(screen.getByLabelText("6-digit code"), "6");
    expect(screen.getByRole("button", { name: "Verify code" })).toHaveProperty("disabled", false);
  });

  it("reports the new state after a correct code and forgets the pending request", async () => {
    const user = userEvent.setup();
    const { onSignedIn } = renderPanel();
    await reachCodeStep(user);
    mocks.sendMessage.mockResolvedValueOnce(success(SIGNED_IN));

    await user.type(screen.getByLabelText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify code" }));

    await vi.waitFor(() => {
      expect(onSignedIn).toHaveBeenCalledExactlyOnceWith(SIGNED_IN);
    });
    expect(mocks.sendMessage).toHaveBeenLastCalledWith({
      type: "auth.verifyCode",
      email: "a@b.test",
      code: "123456",
    });
    expect(readPendingSignIn(Date.now())).toBeNull();
  });

  it("shows an error and clears the field after a wrong code", async () => {
    const user = userEvent.setup();
    const { onSignedIn } = renderPanel();
    await reachCodeStep(user);
    mocks.sendMessage.mockResolvedValueOnce(failure("invalid_code"));

    await user.type(screen.getByLabelText("6-digit code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify code" }));

    expect((await screen.findByRole("alert")).textContent).toContain("wrong or has expired");
    expect(screen.getByLabelText("6-digit code")).toHaveProperty("value", "");
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("returns to the email step and forgets the request on a different email", async () => {
    const user = userEvent.setup();
    renderPanel();
    await reachCodeStep(user);

    await user.click(screen.getByRole("button", { name: "Use a different email" }));

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(readPendingSignIn(Date.now())).toBeNull();
  });

  it("restores the code step when a request is still pending", () => {
    savePendingSignIn({ email: "a@b.test", sentAt: Date.now() - 20_000 });

    renderPanel();

    expect(screen.getByLabelText("6-digit code")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("a@b.test");
    expect(screen.getByRole("button", { name: /^Resend code in \d+s$/ })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("allows resending when the lock of a restored request has elapsed", () => {
    savePendingSignIn({ email: "a@b.test", sentAt: Date.now() - 90_000 });

    renderPanel();

    expect(screen.getByRole("button", { name: "Resend code" })).toHaveProperty("disabled", false);
  });

  it("locks resend for a minute, counts down and then sends a new code", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel();
    await reachCodeStep(user);

    expect(
      screen.getByRole("button", { name: `Resend code in ${String(RESEND_DELAY_SECONDS)}s` }),
    ).toHaveProperty("disabled", true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESEND_DELAY_SECONDS * 1000);
    });
    mocks.sendMessage.mockResolvedValueOnce(success(null));
    await user.click(screen.getByRole("button", { name: "Resend code" }));

    expect((await screen.findByRole("status")).textContent).toContain("A new code was sent.");
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
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
