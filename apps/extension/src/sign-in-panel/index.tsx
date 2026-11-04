import { useState } from "react";
import { browser } from "wxt/browser";

import { ERROR_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "../form-controls";
import { sendMessage } from "../message-client";
import { type AuthState } from "../messages";
import { ERROR_MESSAGES, type ErrorCode } from "@sitenote/widget";
import { clearPendingSignIn } from "../pending-sign-in";

interface SignInPanelProps {
  googleEnabled: boolean;
  webUrl: string;
  onSignedIn: (state: AuthState) => void;
}

export function SignInPanel({ googleEnabled, webUrl, onSignedIn }: SignInPanelProps) {
  const [error, setError] = useState<ErrorCode | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function openWebsite() {
    await browser.tabs.create({ url: `${webUrl}/extension/connect` });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600">Sign in on the website to connect the extension.</p>
      <button type="button" onClick={() => void openWebsite()} className={PRIMARY_BUTTON_CLASS}>
        Sign in on the website
      </button>
      {error === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {ERROR_MESSAGES[error]}
        </p>
      )}
      {googleEnabled ? (
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
