"use client";

import { useActionState, useState } from "react";

import { ERROR_CLASS, INPUT_CLASS, SECONDARY_BUTTON_CLASS } from "../form-controls";
import { revokeInvite, type InviteActionState } from "../invite-actions";

const INITIAL_STATE: InviteActionState = { error: null };

type CopyState = "idle" | "copied" | "failed";

interface InviteRowActionsProps {
  workspaceId: string;
  inviteId: string;
  link: string;
}

export function InviteRowActions({ workspaceId, inviteId, link }: InviteRowActionsProps) {
  const [copy, setCopy] = useState<CopyState>("idle");
  const [state, formAction, pending] = useActionState(revokeInvite, INITIAL_STATE);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void copyLink()} className={SECONDARY_BUTTON_CLASS}>
          Copy link
        </button>
        <form action={formAction}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="inviteId" value={inviteId} />
          <button type="submit" disabled={pending} className={SECONDARY_BUTTON_CLASS}>
            {pending ? "Revoking..." : "Revoke"}
          </button>
        </form>
      </div>
      {copy === "copied" ? (
        <p role="status" className="text-sm text-neutral-700">
          Link copied.
        </p>
      ) : null}
      {copy === "failed" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`invite-link-${inviteId}`} className="text-sm text-neutral-700">
            Copying is blocked in this browser. Copy the link from this field.
          </label>
          <input
            id={`invite-link-${inviteId}`}
            type="text"
            readOnly
            value={link}
            autoFocus
            onFocus={(event) => {
              event.currentTarget.select();
            }}
            className={INPUT_CLASS}
          />
        </div>
      ) : null}
      {state.error === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {state.error}
        </p>
      )}
    </div>
  );
}
