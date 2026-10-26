import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  getSession: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock("../env", () => ({
  getPublicEnv: () => ({ webUrl: "http://localhost:3000" }),
}));
vi.mock("../supabase-browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      getSession: mocks.getSession,
      signInWithOAuth: mocks.signInWithOAuth,
    },
  }),
}));

import { RESEND_DELAY_SECONDS, SESSION_POLL_INTERVAL_MS, SignInForm } from ".";

function setup(props: Partial<Parameters<typeof SignInForm>[0]> = {}) {
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  render(<SignInForm next="/app" googleEnabled={false} initialError={null} {...props} />);
  return user;
}

async function reachWaitingStep(
  user: ReturnType<typeof userEvent.setup>,
  email = "ada@example.com",
) {
  await user.type(screen.getByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
  await screen.findByRole("button", { name: /^Resend link/ });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mocks.signInWithOtp.mockResolvedValue({ data: {}, error: null });
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("email step", () => {
  it("asks for an email address and nothing else", () => {
    setup();

    expect(screen.getByLabelText("Email")).toHaveProperty("type", "email");
    expect(screen.queryByLabelText(/code/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /google/i })).toBeNull();
  });

  it("requests a link for a new or existing user and moves to the waiting step", async () => {
    const user = setup();

    await reachWaitingStep(user);

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "ada@example.com",
      options: {
        shouldCreateUser: true,
        emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fapp",
      },
    });
    expect(screen.getByRole("status").textContent).toContain("ada@example.com");
  });

  it("sends the magic link back to the callback with the safe next path", async () => {
    const user = setup({ next: "/app/settings?tab=members" });

    await reachWaitingStep(user);

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "ada@example.com",
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `http://localhost:3000/auth/callback?next=${encodeURIComponent("/app/settings?tab=members")}`,
      },
    });
  });

  it("stays on the email step and explains a rate limit", async () => {
    mocks.signInWithOtp.mockResolvedValue({
      data: {},
      error: { code: "over_email_send_rate_limit", status: 429 },
    });
    const user = setup();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Too many attempts");
    expect(screen.queryByLabelText(/code/i)).toBeNull();
  });

  it("explains an address the server rejects", async () => {
    mocks.signInWithOtp.mockResolvedValue({
      data: {},
      error: { code: "email_address_invalid", status: 400 },
    });
    const user = setup();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Enter a valid email address.");
  });

  it("recovers from an exception thrown by the client", async () => {
    mocks.signInWithOtp.mockRejectedValue(new Error("boom"));
    const user = setup();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect((await screen.findByRole("alert")).textContent).toContain("could not send the link");
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("shows an error handed over from the auth callback", () => {
    setup({ initialError: "Sign-in was cancelled. You can try again." });

    expect(screen.getByRole("alert").textContent).toBe("Sign-in was cancelled. You can try again.");
  });
});

describe("waiting step", () => {
  it("tells the user to open the link and offers no code field", async () => {
    const user = setup();
    await reachWaitingStep(user);

    const status = screen.getByRole("status").textContent;
    expect(status).toContain("ada@example.com");
    expect(status).toContain("sign-in link");
    expect(screen.queryByLabelText(/code/i)).toBeNull();
  });

  it("keeps waiting while there is no session or only a guest session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } });
    const user = setup();
    await reachWaitingStep(user);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_POLL_INTERVAL_MS * 3);
    });

    expect(screen.queryByTestId("signed-in")).toBeNull();
  });

  it("switches to signed in once the link was opened and offers the dashboard", async () => {
    const user = setup();
    await reachWaitingStep(user);
    mocks.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: false } } } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_POLL_INTERVAL_MS);
    });

    expect(screen.getByTestId("signed-in").textContent).toContain("ada@example.com");
    expect(screen.getByRole("link", { name: "Open dashboard" }).getAttribute("href")).toBe("/app");
  });

  it("checks again as soon as the tab becomes visible", async () => {
    const user = setup();
    await reachWaitingStep(user);
    mocks.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: false } } } });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId("signed-in")).toBeTruthy();
  });

  it("labels the way on as Continue when the destination is not the dashboard", async () => {
    const user = setup({ next: "/invite/abc" });
    await reachWaitingStep(user);
    mocks.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: false } } } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_POLL_INTERVAL_MS);
    });

    expect(screen.getByRole("link", { name: "Continue" }).getAttribute("href")).toBe("/invite/abc");
  });

  it("goes back to the email step", async () => {
    const user = setup();
    await reachWaitingStep(user);

    await user.click(screen.getByRole("button", { name: "Use a different email" }));

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /resend/i })).toBeNull();
  });
});

describe("resend", () => {
  it("is locked for 60 seconds and then sends a new link", async () => {
    const user = setup();
    await reachWaitingStep(user);
    const resend = screen.getByRole("button", {
      name: `Resend link in ${String(RESEND_DELAY_SECONDS)}s`,
    });
    expect(resend).toHaveProperty("disabled", true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync((RESEND_DELAY_SECONDS - 1) * 1000);
    });
    expect(screen.getByRole("button", { name: "Resend link in 1s" })).toHaveProperty(
      "disabled",
      true,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const ready = screen.getByRole("button", { name: "Resend link" });
    expect(ready).toHaveProperty("disabled", false);

    await user.click(ready);

    await waitFor(() => {
      expect(mocks.signInWithOtp).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("status").textContent).toContain("A new link was sent.");
    expect(screen.getByRole("button", { name: "Resend link in 60s" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("reports a failed resend", async () => {
    const user = setup();
    await reachWaitingStep(user);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESEND_DELAY_SECONDS * 1000);
    });
    mocks.signInWithOtp.mockResolvedValue({ data: {}, error: { status: 429 } });

    await user.click(screen.getByRole("button", { name: "Resend link" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Too many attempts");
  });
});

describe("Google sign-in", () => {
  it("is offered only when enabled and starts OAuth with the callback and next path", async () => {
    const user = setup({ googleEnabled: true, next: "/app?tab=members" });

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/app?tab=members")}`,
      },
    });
  });

  it("shows an error when OAuth cannot start", async () => {
    mocks.signInWithOAuth.mockResolvedValue({ data: {}, error: { status: 500 } });
    const user = setup({ googleEnabled: true });

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Google sign-in");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toHaveProperty(
      "disabled",
      false,
    );
  });
});
