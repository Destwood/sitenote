import {
  AuthApiError,
  AuthRetryableFetchError,
  type Session,
  type User,
} from "@supabase/supabase-js";
import type { SitenoteClient } from "@sitenote/db";
import { describe, expect, it, vi } from "vitest";

import { failure, success } from "../messages";
import type { SessionStorage } from "../session-storage";
import { createAuthService } from ".";

const REDIRECT = "https://anefihllkbkenhjbjggfndgemgkfaeoa.chromiumapp.org/";
const OAUTH_URL = "http://127.0.0.1:54321/auth/v1/authorize?provider=google";
const EXPIRES_AT = 1_900_000_000;

function user(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-10-21T00:00:00Z",
    email: "max@sitenote.test",
    is_anonymous: false,
    ...overrides,
  };
}

function session(overrides: Partial<User> = {}): Session {
  return {
    access_token: "access",
    refresh_token: "refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: EXPIRES_AT,
    user: user(overrides),
  };
}

function createFake() {
  const auth = {
    getSession: vi.fn(),
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    signInWithOAuth: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    signOut: vi.fn(),
  };
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const storage = { clear: vi.fn(() => Promise.resolve()) };
  const launchWebAuthFlow = vi.fn();
  const client = { auth, from } as unknown as SitenoteClient;
  return { auth, from, select, eq, maybeSingle, storage, launchWebAuthFlow, client };
}

function setup(googleEnabled = true) {
  const fake = createFake();
  fake.maybeSingle.mockResolvedValue({ data: { display_name: "Max Member" }, error: null });
  const service = createAuthService({
    client: fake.client,
    storage: fake.storage as unknown as SessionStorage,
    googleEnabled,
    getRedirectUrl: () => REDIRECT,
    launchWebAuthFlow: fake.launchWebAuthFlow,
  });
  return { ...fake, service };
}

const SIGNED_IN_MAX = {
  status: "signedIn",
  user: {
    id: "user-1",
    email: "max@sitenote.test",
    displayName: "Max Member",
    isAnonymous: false,
  },
} as const;

describe("keepFresh", () => {
  it("reports an active session with its expiry", async () => {
    const { service, auth } = setup();
    const current = session();
    auth.getSession.mockResolvedValue({ data: { session: current }, error: null });

    expect(await service.keepFresh()).toEqual({
      outcome: { status: "active", expiresAt: EXPIRES_AT },
      session: current,
    });
  });

  it("reports signed out when there is no session", async () => {
    const { service, auth } = setup();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    expect(await service.keepFresh()).toEqual({ outcome: { status: "signedOut" }, session: null });
  });

  it("reports signed out when the refresh token was rejected", async () => {
    const { service, auth } = setup();
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found"),
    });

    expect((await service.keepFresh()).outcome).toEqual({ status: "signedOut" });
  });

  it("asks for a retry when the server cannot be reached", async () => {
    const { service, auth } = setup();
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    });

    expect((await service.keepFresh()).outcome).toEqual({ status: "retry" });
  });

  it("asks for a retry when reading the session throws", async () => {
    const { service, auth } = setup();
    auth.getSession.mockRejectedValue(new Error("storage unavailable"));

    expect((await service.keepFresh()).outcome).toEqual({ status: "retry" });
  });
});

describe("getState", () => {
  it("returns signed out without a session", async () => {
    const { service, auth, from } = setup();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    expect(await service.getState()).toEqual(success({ status: "signedOut" }));
    expect(from).not.toHaveBeenCalled();
  });

  it("returns the user with the display name from profiles", async () => {
    const { service, auth, from, select, eq } = setup();
    auth.getSession.mockResolvedValue({ data: { session: session() }, error: null });

    expect(await service.getState()).toEqual(success(SIGNED_IN_MAX));
    expect(from).toHaveBeenCalledWith("profiles");
    expect(select).toHaveBeenCalledWith("display_name");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("falls back to the email when the profile is missing", async () => {
    const { service, auth, maybeSingle } = setup();
    auth.getSession.mockResolvedValue({ data: { session: session() }, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await service.getState()).toEqual(
      success({
        status: "signedIn",
        user: { ...SIGNED_IN_MAX.user, displayName: "max@sitenote.test" },
      }),
    );
  });

  it("falls back to the email when the profile query throws", async () => {
    const { service, auth, maybeSingle } = setup();
    auth.getSession.mockResolvedValue({ data: { session: session() }, error: null });
    maybeSingle.mockRejectedValue(new Error("offline"));

    expect(await service.getState()).toEqual(
      success({
        status: "signedIn",
        user: { ...SIGNED_IN_MAX.user, displayName: "max@sitenote.test" },
      }),
    );
  });

  it("describes an anonymous user without an email", async () => {
    const { service, auth, maybeSingle } = setup();
    auth.getSession.mockResolvedValue({
      data: { session: session({ email: "", is_anonymous: true }) },
      error: null,
    });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await service.getState()).toEqual(
      success({
        status: "signedIn",
        user: { id: "user-1", email: null, displayName: "Account", isAnonymous: true },
      }),
    );
  });

  it("reports a failure when the session cannot be checked", async () => {
    const { service, auth } = setup();
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    });

    expect(await service.getState()).toEqual(failure("state_failed"));
  });
});

describe("sendCode", () => {
  it("asks Supabase for a code and creates the user when needed", async () => {
    const { service, auth } = setup();
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });

    expect(await service.sendCode("a@b.test")).toEqual(success(null));
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "a@b.test",
      options: { shouldCreateUser: true },
    });
  });

  it.each([
    ["HTTP 429", new AuthApiError("slow down", 429, undefined), "rate_limited"],
    [
      "the e-mail rate limit code",
      new AuthApiError("slow down", 400, "over_email_send_rate_limit"),
      "rate_limited",
    ],
    [
      "the request rate limit code",
      new AuthApiError("slow down", 400, "over_request_rate_limit"),
      "rate_limited",
    ],
    [
      "an invalid address",
      new AuthApiError("bad address", 400, "email_address_invalid"),
      "invalid_email",
    ],
    ["a server error", new AuthApiError("boom", 500, "unexpected_failure"), "send_failed"],
    ["a network error", new AuthRetryableFetchError("Failed to fetch", 0), "send_failed"],
  ] as const)("maps %s to %s", async (_name, error, code) => {
    const { service, auth } = setup();
    auth.signInWithOtp.mockResolvedValue({ data: {}, error });

    expect(await service.sendCode("a@b.test")).toEqual(failure(code));
  });

  it("maps a thrown exception to send_failed", async () => {
    const { service, auth } = setup();
    auth.signInWithOtp.mockRejectedValue(new Error("boom"));

    expect(await service.sendCode("a@b.test")).toEqual(failure("send_failed"));
  });
});

describe("verifyCode", () => {
  it("verifies the code as an e-mail token and returns the new state", async () => {
    const { service, auth } = setup();
    auth.verifyOtp.mockResolvedValue({ data: { session: session(), user: user() }, error: null });

    expect(await service.verifyCode("a@b.test", "123456")).toEqual(success(SIGNED_IN_MAX));
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "a@b.test",
      token: "123456",
      type: "email",
    });
  });

  it.each([
    ["an expired or wrong code", new AuthApiError("expired", 403, "otp_expired"), "invalid_code"],
    ["HTTP 429", new AuthApiError("slow down", 429, undefined), "rate_limited"],
    ["a server error", new AuthApiError("boom", 500, "unexpected_failure"), "verify_failed"],
    ["a network error", new AuthRetryableFetchError("Failed to fetch", 0), "verify_failed"],
  ] as const)("maps %s to %s", async (_name, error, code) => {
    const { service, auth } = setup();
    auth.verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error });

    expect(await service.verifyCode("a@b.test", "123456")).toEqual(failure(code));
  });

  it("maps a thrown exception to verify_failed", async () => {
    const { service, auth } = setup();
    auth.verifyOtp.mockRejectedValue(new Error("boom"));

    expect(await service.verifyCode("a@b.test", "123456")).toEqual(failure("verify_failed"));
  });
});

describe("signInWithGoogle", () => {
  it("refuses to start when the flag is off", async () => {
    const { service, auth, launchWebAuthFlow } = setup(false);

    expect(await service.signInWithGoogle()).toEqual(failure("google_disabled"));
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(launchWebAuthFlow).not.toHaveBeenCalled();
  });

  it("runs the PKCE flow through the web auth flow and exchanges the code", async () => {
    const { service, auth, launchWebAuthFlow } = setup();
    auth.signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: OAUTH_URL },
      error: null,
    });
    launchWebAuthFlow.mockResolvedValue(`${REDIRECT}?code=pkce-code`);
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: session(), user: user() },
      error: null,
    });

    expect(await service.signInWithGoogle()).toEqual(success(SIGNED_IN_MAX));
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
    });
    expect(launchWebAuthFlow).toHaveBeenCalledWith(OAUTH_URL);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
  });

  it("reports a cancellation when the user closes the window", async () => {
    const { service, auth, launchWebAuthFlow } = setup();
    auth.signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: OAUTH_URL },
      error: null,
    });
    launchWebAuthFlow.mockRejectedValue(new Error("The user did not approve access."));

    expect(await service.signInWithGoogle()).toEqual(failure("google_cancelled"));
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("reports a cancellation when no redirect URL comes back", async () => {
    const { service, auth, launchWebAuthFlow } = setup();
    auth.signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: OAUTH_URL },
      error: null,
    });
    launchWebAuthFlow.mockResolvedValue(undefined);

    expect(await service.signInWithGoogle()).toEqual(failure("google_cancelled"));
  });

  it("reports a cancellation when the provider answers access_denied", async () => {
    const { service, auth, launchWebAuthFlow } = setup();
    auth.signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: OAUTH_URL },
      error: null,
    });
    launchWebAuthFlow.mockResolvedValue(`${REDIRECT}?error=access_denied`);

    expect(await service.signInWithGoogle()).toEqual(failure("google_cancelled"));
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it.each([
    ["a provider error", `${REDIRECT}?error=server_error`],
    ["a redirect without a code", REDIRECT],
    ["a redirect to another origin", "https://evil.example/?code=pkce-code"],
  ])("reports a failure for %s", async (_name, redirected) => {
    const { service, auth, launchWebAuthFlow } = setup();
    auth.signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: OAUTH_URL },
      error: null,
    });
    launchWebAuthFlow.mockResolvedValue(redirected);

    expect(await service.signInWithGoogle()).toEqual(failure("google_failed"));
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("reports a failure when the flow cannot be started", async () => {
    const { service, auth, launchWebAuthFlow } = setup();
    auth.signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: null },
      error: new AuthApiError("provider disabled", 400, "validation_failed"),
    });

    expect(await service.signInWithGoogle()).toEqual(failure("google_failed"));
    expect(launchWebAuthFlow).not.toHaveBeenCalled();
  });

  it("reports a failure when the code exchange is rejected", async () => {
    const { service, auth, launchWebAuthFlow } = setup();
    auth.signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: OAUTH_URL },
      error: null,
    });
    launchWebAuthFlow.mockResolvedValue(`${REDIRECT}?code=stale`);
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError("bad code", 400, "flow_state_not_found"),
    });

    expect(await service.signInWithGoogle()).toEqual(failure("google_failed"));
  });

  it("maps a thrown exception to google_failed", async () => {
    const { service, auth } = setup();
    auth.signInWithOAuth.mockRejectedValue(new Error("boom"));

    expect(await service.signInWithGoogle()).toEqual(failure("google_failed"));
  });
});

describe("signOut", () => {
  it("signs out locally and clears the stored keys", async () => {
    const { service, auth, storage } = setup();
    auth.signOut.mockResolvedValue({ error: null });

    expect(await service.signOut()).toEqual(success({ status: "signedOut" }));
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(storage.clear).toHaveBeenCalledTimes(1);
  });

  it("reports a failure when Supabase refuses", async () => {
    const { service, auth, storage } = setup();
    auth.signOut.mockResolvedValue({ error: new AuthApiError("boom", 500, undefined) });

    expect(await service.signOut()).toEqual(failure("sign_out_failed"));
    expect(storage.clear).not.toHaveBeenCalled();
  });

  it("reports a failure when the storage cannot be cleared", async () => {
    const { service, auth, storage } = setup();
    auth.signOut.mockResolvedValue({ error: null });
    storage.clear.mockRejectedValue(new Error("quota"));

    expect(await service.signOut()).toEqual(failure("sign_out_failed"));
  });
});
