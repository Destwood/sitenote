"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type SubmitEvent as FormSubmitEvent,
} from "react";

import {
  describeOAuthError,
  describeSendCodeError,
  describeVerifyCodeError,
  type AuthFailure,
} from "../auth-error";
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

export const OTP_LENGTH = 6;
export const RESEND_DELAY_SECONDS = 60;

type Step = "email" | "code";

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
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
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

  async function requestCode(): Promise<boolean> {
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
    if (await requestCode()) {
      setCode("");
      setStep("code");
    }
  }

  async function handleCodeSubmit(event: FormSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || code.length !== OTP_LENGTH) {
      return;
    }
    setBusy(true);
    setError(null);
    const failure = await attempt(() =>
      getSupabaseBrowserClient().auth.verifyOtp({ email, token: code, type: "email" }),
    );
    if (failure !== null) {
      setBusy(false);
      setCode("");
      setError(describeVerifyCodeError(failure));
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function handleResend() {
    if (busy || secondsLeft > 0) {
      return;
    }
    if (await requestCode()) {
      setCode("");
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
    setCode("");
    setError(null);
    setResent(false);
    setSecondsLeft(0);
  }

  function handleCodeChange(event: ChangeEvent<HTMLInputElement>) {
    setCode(event.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH));
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
            {busy ? "Sending code..." : "Email me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={(event) => void handleCodeSubmit(event)} className="flex flex-col gap-4">
          <p role="status" className="text-sm text-neutral-600">
            Check your email. Click the sign-in link, or enter the {OTP_LENGTH}-digit code if the
            email has one. The message was sent to <strong>{email}</strong>.
            {resent ? " A new code was sent." : null}
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sign-in-code" className="text-sm font-medium text-neutral-700">
              {OTP_LENGTH}-digit code
            </label>
            <input
              id="sign-in-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern={`[0-9]{${String(OTP_LENGTH)}}`}
              maxLength={OTP_LENGTH}
              required
              autoFocus
              value={code}
              onChange={handleCodeChange}
              aria-describedby={describedBy}
              className={`${INPUT_CLASS} text-center font-mono text-2xl tracking-[0.5em]`}
            />
          </div>
          {errorMessage}
          <button
            type="submit"
            disabled={busy || code.length !== OTP_LENGTH}
            className={PRIMARY_BUTTON_CLASS}
          >
            {busy ? "Verifying..." : "Verify code"}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={busy || secondsLeft > 0}
              className={LINK_BUTTON_CLASS}
            >
              {secondsLeft > 0 ? `Resend code in ${String(secondsLeft)}s` : "Resend code"}
            </button>
            <button type="button" onClick={handleChangeEmail} className={LINK_BUTTON_CLASS}>
              Use a different email
            </button>
          </div>
        </form>
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
