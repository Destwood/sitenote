import { isAuthRetryableFetchError, type Session } from "@supabase/supabase-js";
import type { SitenoteClient } from "@sitenote/db";

import {
  failure,
  success,
  type AuthDataByType,
  type AuthErrorResponse,
  type AuthResult,
  type AuthState,
} from "../messages";
import { parseOAuthRedirect } from "../oauth-redirect";
import type { RefreshOutcome } from "../refresh-schedule";
import type { SessionStorage } from "../session-storage";

const RATE_LIMIT_STATUS = 429;
const RATE_LIMIT_CODES: ReadonlySet<string> = new Set([
  "over_email_send_rate_limit",
  "over_request_rate_limit",
]);

export interface AuthServiceDeps {
  client: SitenoteClient;
  storage: SessionStorage;
  googleEnabled: boolean;
  getRedirectUrl: () => string;
  launchWebAuthFlow: (url: string) => Promise<string | undefined>;
}

export interface FreshSession {
  outcome: RefreshOutcome;
  session: Session | null;
}

export interface AuthService {
  keepFresh: () => Promise<FreshSession>;
  describeSession: (session: Session | null) => Promise<AuthState>;
  getState: () => Promise<AuthResult<AuthDataByType["auth.getState"]>>;
  sendCode: (email: string) => Promise<AuthResult<AuthDataByType["auth.sendCode"]>>;
  verifyCode: (
    email: string,
    code: string,
  ) => Promise<AuthResult<AuthDataByType["auth.verifyCode"]>>;
  signInWithGoogle: () => Promise<AuthResult<AuthDataByType["auth.signInWithGoogle"]>>;
  signOut: () => Promise<AuthResult<AuthDataByType["auth.signOut"]>>;
}

type GoogleCodeResult = { code: string } | { response: AuthErrorResponse };

interface ErrorLike {
  code?: string | undefined;
  status?: number | undefined;
}

function isRateLimited(error: ErrorLike): boolean {
  return (
    error.status === RATE_LIMIT_STATUS ||
    (error.code !== undefined && RATE_LIMIT_CODES.has(error.code))
  );
}

function normalizeEmail(email: string | undefined): string | null {
  return email === undefined || email === "" ? null : email;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { client, storage } = deps;

  async function keepFresh(): Promise<FreshSession> {
    try {
      const { data, error } = await client.auth.getSession();
      if (data.session !== null) {
        return {
          outcome: { status: "active", expiresAt: data.session.expires_at },
          session: data.session,
        };
      }
      if (error !== null && isAuthRetryableFetchError(error)) {
        return { outcome: { status: "retry" }, session: null };
      }
      return { outcome: { status: "signedOut" }, session: null };
    } catch {
      return { outcome: { status: "retry" }, session: null };
    }
  }

  async function readProfileName(userId: string): Promise<string | null> {
    try {
      const profile = await client
        .from("profiles")
        .select("display_name")
        .eq("user_id", userId)
        .maybeSingle();
      return profile.data?.display_name ?? null;
    } catch {
      return null;
    }
  }

  async function describeSession(session: Session | null): Promise<AuthState> {
    if (session === null) {
      return { status: "signedOut" };
    }
    const { user } = session;
    const email = normalizeEmail(user.email);
    const profileName = await readProfileName(user.id);
    return {
      status: "signedIn",
      user: {
        id: user.id,
        email,
        displayName: profileName ?? email ?? "Account",
        isAnonymous: user.is_anonymous ?? false,
      },
    };
  }

  async function getState(): Promise<AuthResult<AuthState>> {
    const { outcome, session } = await keepFresh();
    if (outcome.status === "retry") {
      return failure("state_failed");
    }
    return success(await describeSession(session));
  }

  async function sendCode(email: string): Promise<AuthResult<null>> {
    try {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error === null) {
        return success(null);
      }
      if (isRateLimited(error)) {
        return failure("rate_limited");
      }
      return failure(error.code === "email_address_invalid" ? "invalid_email" : "send_failed");
    } catch {
      return failure("send_failed");
    }
  }

  async function verifyCode(email: string, code: string): Promise<AuthResult<AuthState>> {
    try {
      const { data, error } = await client.auth.verifyOtp({ email, token: code, type: "email" });
      if (error !== null) {
        if (isRateLimited(error)) {
          return failure("rate_limited");
        }
        return failure(error.code === "otp_expired" ? "invalid_code" : "verify_failed");
      }
      return success(await describeSession(data.session));
    } catch {
      return failure("verify_failed");
    }
  }

  async function obtainGoogleCode(): Promise<GoogleCodeResult> {
    const redirectTo = deps.getRedirectUrl();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error !== null) {
      return { response: failure(isRateLimited(error) ? "rate_limited" : "google_failed") };
    }

    let redirected: string | undefined;
    try {
      redirected = await deps.launchWebAuthFlow(data.url);
    } catch {
      return { response: failure("google_cancelled") };
    }
    if (redirected === undefined) {
      return { response: failure("google_cancelled") };
    }

    const parsed = parseOAuthRedirect(redirected, redirectTo);
    switch (parsed.kind) {
      case "code":
        return { code: parsed.code };
      case "denied":
        return { response: failure("google_cancelled") };
      case "error":
      case "missing":
        return { response: failure("google_failed") };
    }
  }

  async function signInWithGoogle(): Promise<AuthResult<AuthState>> {
    if (!deps.googleEnabled) {
      return failure("google_disabled");
    }
    try {
      const obtained = await obtainGoogleCode();
      if ("response" in obtained) {
        return obtained.response;
      }
      const { data, error } = await client.auth.exchangeCodeForSession(obtained.code);
      if (error !== null) {
        return failure(isRateLimited(error) ? "rate_limited" : "google_failed");
      }
      return success(await describeSession(data.session));
    } catch {
      return failure("google_failed");
    }
  }

  async function signOut(): Promise<AuthResult<AuthState>> {
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error !== null) {
        return failure("sign_out_failed");
      }
      await storage.clear();
      return success<AuthState>({ status: "signedOut" });
    } catch {
      return failure("sign_out_failed");
    }
  }

  return { keepFresh, describeSession, getState, sendCode, verifyCode, signInWithGoogle, signOut };
}
