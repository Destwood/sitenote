"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type SubmitEvent as FormSubmitEvent,
} from "react";

import { describeOAuthError, describeSendCodeError, type AuthFailure } from "../auth-error";
import { getPublicEnv } from "../env";
import {
  PUBLIC_ERROR_CLASS,
  PUBLIC_INPUT_CLASS,
  PUBLIC_LINK_BUTTON_CLASS,
  PUBLIC_PRIMARY_BUTTON_CLASS,
  PUBLIC_SECONDARY_BUTTON_CLASS,
} from "../public-styles";
import { getSupabaseBrowserClient } from "../supabase-browser";

const subscribeToNothing = () => () => undefined;
const isClient = () => true;
const isServer = () => false;

export const RESEND_DELAY_SECONDS = 60;

type Step = "email" | "sent";

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
      setError(describeSendCodeError(failure));
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
      setStep("sent");
    }
  }

  async function handleResend() {
    if (busy || secondsLeft > 0) {
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

  const errorMessage =
    error === null ? null : (
      <p id="sign-in-error" role="alert" className={PUBLIC_ERROR_CLASS}>
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
              className={PUBLIC_INPUT_CLASS}
            />
          </div>
          {errorMessage}
          <button
            type="submit"
            disabled={busy || !hydrated}
            className={`${PUBLIC_PRIMARY_BUTTON_CLASS} w-full`}
          >
            {busy ? "Sending link..." : "Email me a sign-in link"}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p role="status" className="text-sm text-neutral-600">
            We sent a sign-in link to <strong>{email}</strong>. Use the link in the email to log in.
            {resent ? " A new link was sent." : null}
          </p>
          {errorMessage}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={busy || secondsLeft > 0}
              className={PUBLIC_LINK_BUTTON_CLASS}
            >
              {secondsLeft > 0 ? `Resend link in ${String(secondsLeft)}s` : "Resend link"}
            </button>
            <button type="button" onClick={handleChangeEmail} className={PUBLIC_LINK_BUTTON_CLASS}>
              Use a different email
            </button>
          </div>
        </div>
      )}
      {googleEnabled && step === "email" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 text-xs tracking-wide text-neutral-500 uppercase">
            <span aria-hidden="true" className="h-px flex-1 bg-neutral-200" />
            <p>or</p>
            <span aria-hidden="true" className="h-px flex-1 bg-neutral-200" />
          </div>
          <button
            type="button"
            onClick={() => void handleGoogle()}
            disabled={busy || !hydrated}
            className={`${PUBLIC_SECONDARY_BUTTON_CLASS} w-full`}
          >
            Continue with Google
          </button>
        </div>
      ) : null}
    </div>
  );
}
