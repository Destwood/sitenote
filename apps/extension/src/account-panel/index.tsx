import { useState } from "react";

import { ERROR_CLASS } from "../form-controls";
import { Icon } from "../icon";
import { sendMessage } from "../message-client";
import { type AuthState } from "../messages";
import { ERROR_MESSAGES, type ErrorCode } from "@sitenote/widget";

type SignedInState = Extract<AuthState, { status: "signedIn" }>;

interface AccountPanelProps {
  user: SignedInState["user"];
  onSignedOut: (state: AuthState) => void;
}

export function initialOf(name: string): string {
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
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2.5 border-b border-neutral-200 px-2 pt-2 pb-3">
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-bold text-stone-700"
        >
          {initialOf(user.displayName)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span
            data-testid="display-name"
            title={user.email ?? "Guest session"}
            className="truncate text-sm font-semibold text-neutral-900"
          >
            {user.displayName}
          </span>
          {user.email === null ? null : (
            <span className="truncate text-xs text-neutral-500">{user.email}</span>
          )}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={busy}
        className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Icon name="logout" size={15} />
        {busy ? "Signing out..." : "Sign out"}
      </button>
      {error === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {ERROR_MESSAGES[error]}
        </p>
      )}
    </div>
  );
}
