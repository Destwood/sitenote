"use client";

import { useActionState } from "react";

import { ERROR_CLASS, INPUT_CLASS, PRIMARY_BUTTON_CLASS } from "../form-controls";
import { createInvite, type InviteActionState } from "../invite-actions";
import {
  DEFAULT_EXPIRY_DAYS,
  EXPIRY_OPTIONS,
  INVITE_ROLES,
  INVITE_ROLE_LABELS,
} from "../invite-options";

const INITIAL_STATE: InviteActionState = { error: null };

interface CreateInviteFormProps {
  workspaceId: string;
}

export function CreateInviteForm({ workspaceId }: CreateInviteFormProps) {
  const [state, formAction, pending] = useActionState(createInvite, INITIAL_STATE);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3"
      aria-labelledby="create-invite-heading"
    >
      <h2 id="create-invite-heading" className="text-lg font-semibold">
        Create invite link
      </h2>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <label htmlFor="invite-role" className="text-sm font-medium text-neutral-700">
            Role
          </label>
          <select id="invite-role" name="role" defaultValue="guest" className={INPUT_CLASS}>
            {INVITE_ROLES.map((role) => (
              <option key={role} value={role}>
                {INVITE_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <label htmlFor="invite-expiry" className="text-sm font-medium text-neutral-700">
            Expires in
          </label>
          <select
            id="invite-expiry"
            name="expiresInDays"
            defaultValue={String(DEFAULT_EXPIRY_DAYS)}
            className={INPUT_CLASS}
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.days} value={String(option.days)}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {state.error === null ? null : (
        <p id="invite-create-error" role="alert" className={ERROR_CLASS}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${PRIMARY_BUTTON_CLASS} w-fit`}>
        {pending ? "Creating..." : "Create invite link"}
      </button>
    </form>
  );
}
