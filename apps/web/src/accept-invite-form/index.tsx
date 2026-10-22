"use client";

import { useActionState } from "react";

import { ERROR_CLASS, PRIMARY_BUTTON_CLASS } from "../form-controls";
import { acceptInvite, type InviteActionState } from "../invite-actions";
import { INVITE_ROLE_LABELS, type InviteRole } from "../invite-options";

const INITIAL_STATE: InviteActionState = { error: null };

interface AcceptInviteFormProps {
  token: string;
  workspaceName: string;
  role: InviteRole;
}

export function AcceptInviteForm({ token, workspaceName, role }: AcceptInviteFormProps) {
  const [state, formAction, pending] = useActionState(acceptInvite, INITIAL_STATE);
  const roleLabel = INVITE_ROLE_LABELS[role].toLowerCase();

  return (
    <form action={formAction} className="flex flex-col gap-4" aria-labelledby="accept-heading">
      <h1 id="accept-heading" className="text-2xl font-bold tracking-tight">
        You have been invited to {workspaceName}
      </h1>
      <input type="hidden" name="token" value={token} />
      {state.error === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${PRIMARY_BUTTON_CLASS} w-fit`}>
        {pending ? "Joining..." : `Join ${workspaceName} as ${roleLabel}`}
      </button>
    </form>
  );
}
