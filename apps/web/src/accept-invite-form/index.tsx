"use client";

import { useActionState } from "react";

import { acceptInvite, type InviteActionState } from "../invite-actions";
import { INVITE_ROLE_LABELS, type InviteRole } from "../invite-options";
import { PUBLIC_ERROR_CLASS, PUBLIC_PRIMARY_BUTTON_CLASS } from "../public-styles";

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
    <form action={formAction} className="flex flex-col gap-6" aria-labelledby="accept-heading">
      <h1 id="accept-heading" className="text-2xl font-bold tracking-tight">
        You have been invited to {workspaceName}
      </h1>
      <input type="hidden" name="token" value={token} />
      {state.error === null ? null : (
        <p role="alert" className={PUBLIC_ERROR_CLASS}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${PUBLIC_PRIMARY_BUTTON_CLASS} w-full`}>
        {pending ? "Joining..." : `Join ${workspaceName} as ${roleLabel}`}
      </button>
    </form>
  );
}
