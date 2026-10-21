import { useEffect, useState, type ChangeEvent, type SubmitEvent as FormSubmitEvent } from "react";

import {
  ERROR_CLASS,
  INPUT_CLASS,
  LINK_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../form-controls";
import { sendMessage } from "../message-client";
import { AUTH_ERROR_MESSAGES, OTP_LENGTH, type AuthErrorCode, type AuthState } from "../messages";
import {
  clearPendingSignIn,
  readPendingSignIn,
  savePendingSignIn,
  type PendingSignIn,
} from "../pending-sign-in";

export const RESEND_DELAY_SECONDS = 60;

type Step = "email" | "code";

interface SignInPanelProps {
  googleEnabled: boolean;
  onSignedIn: (state: AuthState) => void;
}

function remainingSeconds(pending: PendingSignIn | null): number {
  if (pending === null) {
    return 0;
  }
  const elapsed = Math.floor((Date.now() - pending.sentAt) / 1000);
  return Math.max(0, RESEND_DELAY_SECONDS - elapsed);
}

export function SignInPanel({ googleEnabled, onSignedIn }: SignInPanelProps) {
  const [pending] = useState(() => readPendingSignIn(Date.now()));
  const [step, setStep] = useState<Step>(pending === null ? "email" : "code");
  const [email, setEmail] = useState(pending?.email ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() => remainingSeconds(pending));
  const [resent, setResent] = useState(false);

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
    const result = await sendMessage({ type: "auth.sendCode", email });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.code);
      return false;
    }
    savePendingSignIn({ email, sentAt: Date.now() });
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
    const result = await sendMessage({ type: "auth.verifyCode", email, code });
    setBusy(false);
    if (!result.ok) {
      setCode("");
      setError(result.error.code);
      return;
    }
    clearPendingSignIn();
    onSignedIn(result.data);
  }

  async function handleResend() {
    if (busy || resendLocked) {
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
    const result = await sendMessage({ type: "auth.signInWithGoogle" });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.code);
      return;
    }
    clearPendingSignIn();
    onSignedIn(result.data);
  }

  function handleChangeEmail() {
    clearPendingSignIn();
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
        {AUTH_ERROR_MESSAGES[error]}
      </p>
    );
  const describedBy = error === null ? undefined : "sign-in-error";

  return (
    <div className="flex flex-col gap-4">
      {step === "email" ? (
        <form onSubmit={(event) => void handleEmailSubmit(event)} className="flex flex-col gap-3">
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
          <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
            {busy ? "Sending code..." : "Email me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={(event) => void handleCodeSubmit(event)} className="flex flex-col gap-3">
          <p role="status" className="text-sm text-neutral-600">
            We sent a {OTP_LENGTH}-digit code to <strong className="break-all">{email}</strong>. It
            expires in 10 minutes.
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={busy || resendLocked}
              className={LINK_BUTTON_CLASS}
            >
              {resendLocked ? `Resend code in ${String(secondsLeft)}s` : "Resend code"}
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
            disabled={busy}
            className={SECONDARY_BUTTON_CLASS}
          >
            Continue with Google
          </button>
        </div>
      ) : null}
    </div>
  );
}
