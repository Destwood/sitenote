import { useState } from "react";

import { ERROR_CLASS, SECONDARY_BUTTON_CLASS } from "../form-controls";
import { sendMessage } from "../message-client";
import { ERROR_MESSAGES, type ErrorCode, type AuthState } from "../messages";

type SignedInState = Extract<AuthState, { status: "signedIn" }>;

interface AccountPanelProps {
  user: SignedInState["user"];
  onSignedOut: (state: AuthState) => void;
}

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
}

export function AccountPanel({ user, onSignedOut }: AccountPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  async function handleSignOut() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await sendMessage({ type: "auth.signOut" });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.code);
      return;
    }
    onSignedOut(result.data);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-lg font-semibold text-white"
        >
          {initialOf(user.displayName)}
        </span>
        <div className="flex min-w-0 flex-col">
          <p data-testid="display-name" className="truncate text-sm font-semibold text-neutral-900">
            {user.displayName}
          </p>
          <p data-testid="account-email" className="truncate text-xs text-neutral-600">
            {user.email ?? "Guest session"}
          </p>
        </div>
      </div>
      {error === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {ERROR_MESSAGES[error]}
        </p>
      )}
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={busy}
        className={SECONDARY_BUTTON_CLASS}
      >
        {busy ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}
