import { useState } from "react";

import { ERROR_CLASS, LINK_BUTTON_CLASS } from "../form-controls";
import { sendMessage } from "../message-client";
import { type AuthState } from "../messages";
import { ERROR_MESSAGES, type ErrorCode } from "@sitenote/widget";

type SignedInState = Extract<AuthState, { status: "signedIn" }>;

interface AccountPanelProps {
  user: SignedInState["user"];
  webUrl: string;
  onSignedOut: (state: AuthState) => void;
}

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
}

export function AccountPanel({ user, webUrl, onSignedOut }: AccountPanelProps) {
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
    <div className="flex flex-col gap-2 border-t border-neutral-200 pt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white"
          >
            {initialOf(user.displayName)}
          </span>
          <a
            data-testid="display-name"
            href={`${webUrl}/app`}
            target="_blank"
            rel="noreferrer"
            title={user.email ?? "Guest session"}
            className="truncate text-xs font-medium text-neutral-900 underline underline-offset-4"
          >
            {user.displayName}
          </a>
        </div>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={busy}
          className={`${LINK_BUTTON_CLASS} shrink-0`}
        >
          {busy ? "Signing out..." : "Sign out"}
        </button>
      </div>
      {error === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {ERROR_MESSAGES[error]}
        </p>
      )}
    </div>
  );
}
