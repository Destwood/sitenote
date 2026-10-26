"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type SubmitEvent as FormSubmitEvent,
} from "react";

import { describeOAuthError, describeSendLinkError, type AuthFailure } from "../auth-error";
import { getPublicEnv } from "../env";
import {
  ERROR_CLASS,
  INPUT_CLASS,
  LINK_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../form-controls";
import { getSupabaseBrowserClient } from "../supabase-browser";

const subscribeToNothing = () => () => undefined;
const isClient = () => true;
const isServer = () => false;

export const RESEND_DELAY_SECONDS = 60;
export const SESSION_POLL_INTERVAL_MS = 2000;

type Step = "email" | "waiting" | "signedIn";

interface SignInFormProps {
  next: string;
  googleEnabled: boolean;
  initialError: string | null;
}

async function attempt(
  action: () => Promise<{ error: AuthFailure | null }>,
): Promise<AuthFailure | null> {
  try {
    const { error } = await action();
    return error;
  } catch {
    return {};
  }
}

async function hasMemberSession(): Promise<boolean> {
  try {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    return data.session !== null && data.session.user.is_anonymous !== true;
  } catch {
    return false;
  }
}

function continueLabel(next: string): string {
  return next === "/app" || next.startsWith("/app/") ? "Open dashboard" : "Continue";
}

export function SignInForm({ next, googleEnabled, initialError }: SignInFormProps) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [resent, setResent] = useState(false);
  const hydrated = useSyncExternalStore(subscribeToNothing, isClient, isServer);

  const resendLocked = secondsLeft > 0;

  useEffect(() => {
    if (!resendLocked) {
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [resendLocked]);

  useEffect(() => {
    if (step !== "waiting") {
      return;
    }
    let active = true;
    async function check() {
      if (await hasMemberSession()) {
        if (active) {
          setStep("signedIn");
        }
      }
    }
    const timer = setInterval(() => {
      void check();
    }, SESSION_POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void check();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [step]);

  async function requestLink(): Promise<boolean> {
    setBusy(true);
    setError(null);
    const emailRedirectTo = `${getPublicEnv().webUrl}/auth/callback?next=${encodeURIComponent(next)}`;
    const failure = await attempt(() =>
      getSupabaseBrowserClient().auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo },
      }),
    );
    setBusy(false);
    if (failure !== null) {
      setError(describeSendLinkError(failure));
      return false;
    }
    setSecondsLeft(RESEND_DELAY_SECONDS);
    return true;
  }

  async function handleEmailSubmit(event: FormSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    if (await requestLink()) {
      setResent(false);
      setStep("waiting");
    }
  }

  async function handleResend() {
    if (busy || resendLocked) {
      return;
    }
    if (await requestLink()) {
      setResent(true);
    }
  }

  async function handleGoogle() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const failure = await attempt(() =>
      getSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      }),
    );
    if (failure !== null) {
      setBusy(false);
      setError(describeOAuthError(failure));
    }
  }

  function handleChangeEmail() {
    setStep("email");
    setError(null);
    setResent(false);
    setSecondsLeft(0);
  }

  if (step === "signedIn") {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" data-testid="signed-in" className="font-medium">
          You are signed in as <strong className="break-all">{email}</strong>.
        </p>
        <Link href={next} className={`${PRIMARY_BUTTON_CLASS} w-fit`}>
          {continueLabel(next)}
        </Link>
      </div>
    );
  }

  const errorMessage =
    error === null ? null : (
      <p id="sign-in-error" role="alert" className={ERROR_CLASS}>
        {error}
      </p>
    );
  const describedBy = error === null ? undefined : "sign-in-error";

  return (
    <div className="flex flex-col gap-6">
      {step === "email" ? (
        <form onSubmit={(event) => void handleEmailSubmit(event)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sign-in-email" className="text-sm font-medium text-neutral-700">
              Email
            </label>
            <input
              id="sign-in-email"
              name="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
              aria-describedby={describedBy}
              className={INPUT_CLASS}
            />
          </div>
          {errorMessage}
          <button type="submit" disabled={busy || !hydrated} className={PRIMARY_BUTTON_CLASS}>
            {busy ? "Sending link..." : "Email me a sign-in link"}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p role="status" className="text-sm text-neutral-600">
            We sent a sign-in link to <strong className="break-all">{email}</strong>. Open it in
            this browser. This page updates as soon as you are signed in.
            {resent ? " A new link was sent." : null}
          </p>
          {errorMessage}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={busy || resendLocked}
              className={LINK_BUTTON_CLASS}
            >
              {resendLocked ? `Resend link in ${String(secondsLeft)}s` : "Resend link"}
            </button>
            <button type="button" onClick={handleChangeEmail} className={LINK_BUTTON_CLASS}>
              Use a different email
            </button>
          </div>
        </div>
      )}
      {googleEnabled && step === "email" ? (
        <div className="flex flex-col gap-3">
          <p className="text-center text-xs tracking-wide text-neutral-500 uppercase">or</p>
          <button
            type="button"
            onClick={() => void handleGoogle()}
            disabled={busy || !hydrated}
            className={SECONDARY_BUTTON_CLASS}
          >
            Continue with Google
          </button>
        </div>
      ) : null}
    </div>
  );
}
