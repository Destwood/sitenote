import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signInWithOAuth: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("../env", () => ({
  getPublicEnv: () => ({ webUrl: "http://localhost:3000" }),
}));
vi.mock("../supabase-browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      verifyOtp: mocks.verifyOtp,
      signInWithOAuth: mocks.signInWithOAuth,
    },
  }),
}));

import { RESEND_DELAY_SECONDS, SignInForm } from ".";

function setup(props: Partial<Parameters<typeof SignInForm>[0]> = {}) {
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  render(<SignInForm next="/app" googleEnabled={false} initialError={null} {...props} />);
  return user;
}

async function reachCodeStep(user: ReturnType<typeof userEvent.setup>, email = "ada@example.com") {
  await user.type(screen.getByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Email me a code" }));
  await screen.findByLabelText("6-digit code");
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mocks.signInWithOtp.mockResolvedValue({ data: {}, error: null });
  mocks.verifyOtp.mockResolvedValue({ data: {}, error: null });
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
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
    expect(screen.queryByRole("button", { name: /google/i })).toBeNull();
  });

  it("requests a code for a new or existing user and moves to the code step", async () => {
    const user = setup();

    await reachCodeStep(user);

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "ada@example.com",
      options: {
        shouldCreateUser: true,
        emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fapp",
      },
    });
    expect(screen.getByRole("status").textContent).toContain("ada@example.com");
    expect(screen.getByRole("status").textContent).toContain("Click the sign-in link");
  });

  it("sends the magic link back to the callback with the safe next path", async () => {
    const user = setup({ next: "/app/settings?tab=members" });

    await reachCodeStep(user);

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
    await user.click(screen.getByRole("button", { name: "Email me a code" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Too many attempts");
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
  });

  it("explains an address the server rejects", async () => {
    mocks.signInWithOtp.mockResolvedValue({
      data: {},
      error: { code: "email_address_invalid", status: 400 },
    });
    const user = setup();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Enter a valid email address.");
  });

  it("recovers from an exception thrown by the client", async () => {
    mocks.signInWithOtp.mockRejectedValue(new Error("boom"));
    const user = setup();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));

    expect((await screen.findByRole("alert")).textContent).toContain("could not send");
    expect(screen.getByRole("button", { name: "Email me a code" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("shows an error handed over from the auth callback", () => {
    setup({ initialError: "Sign-in was cancelled. You can try again." });

    expect(screen.getByRole("alert").textContent).toBe("Sign-in was cancelled. You can try again.");
  });
});

describe("code step", () => {
  it("renders a numeric one-time-code input of six digits", async () => {
    const user = setup();
    await reachCodeStep(user);

    const input = screen.getByLabelText("6-digit code");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.getAttribute("maxlength")).toBe("6");
  });

  it("keeps only digits, caps the length and enables verification at six digits", async () => {
    const user = setup();
    await reachCodeStep(user);
    const input = screen.getByLabelText("6-digit code");
    const verify = screen.getByRole("button", { name: "Verify code" });

    await user.type(input, "12a3 4");
    expect(input).toHaveProperty("value", "1234");
    expect(verify).toHaveProperty("disabled", true);

    await user.type(input, "5678");
    expect(input).toHaveProperty("value", "123456");
    expect(verify).toHaveProperty("disabled", false);
  });

  it("verifies the code and navigates to the safe destination", async () => {
    const user = setup({ next: "/app/settings" });
    await reachCodeStep(user);

    await user.type(screen.getByLabelText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify code" }));

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/app/settings");
    });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      email: "ada@example.com",
      token: "123456",
      type: "email",
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows an error, clears the code and does not navigate when the code is wrong", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: {},
      error: { code: "otp_expired", status: 403 },
    });
    const user = setup();
    await reachCodeStep(user);

    await user.type(screen.getByLabelText("6-digit code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify code" }));

    expect((await screen.findByRole("alert")).textContent).toContain("wrong or has expired");
    expect(screen.getByLabelText("6-digit code")).toHaveProperty("value", "");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("explains a rate limit while verifying", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: {},
      error: { code: "over_request_rate_limit", status: 429 },
    });
    const user = setup();
    await reachCodeStep(user);

    await user.type(screen.getByLabelText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify code" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Too many attempts");
  });

  it("goes back to the email step", async () => {
    const user = setup();
    await reachCodeStep(user);

    await user.click(screen.getByRole("button", { name: "Use a different email" }));

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
  });
});

describe("resend", () => {
  it("is locked for 60 seconds and then sends a new code", async () => {
    const user = setup();
    await reachCodeStep(user);
    const resend = screen.getByRole("button", {
      name: `Resend code in ${String(RESEND_DELAY_SECONDS)}s`,
    });
    expect(resend).toHaveProperty("disabled", true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync((RESEND_DELAY_SECONDS - 1) * 1000);
    });
    expect(screen.getByRole("button", { name: "Resend code in 1s" })).toHaveProperty(
      "disabled",
      true,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const ready = screen.getByRole("button", { name: "Resend code" });
    expect(ready).toHaveProperty("disabled", false);

    await user.click(ready);

    await waitFor(() => {
      expect(mocks.signInWithOtp).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("status").textContent).toContain("A new code was sent.");
    expect(screen.getByRole("button", { name: "Resend code in 60s" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("reports a failed resend", async () => {
    const user = setup();
    await reachCodeStep(user);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESEND_DELAY_SECONDS * 1000);
    });
    mocks.signInWithOtp.mockResolvedValue({ data: {}, error: { status: 429 } });

    await user.click(screen.getByRole("button", { name: "Resend code" }));

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
