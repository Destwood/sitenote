"use client";

import { useActionState } from "react";

import {
  DASH_BUTTON_PRIMARY_CLASS,
  DASH_CARD_CLASS,
  DASH_ERROR_CLASS,
  DASH_LABEL_CLASS,
} from "../dashboard-classes";
import { DashSelect } from "../dash-select";
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
      className={`${DASH_CARD_CLASS} flex flex-col gap-4 p-5`}
      aria-labelledby="create-invite-heading"
    >
      <h2 id="create-invite-heading" className="text-base font-semibold text-neutral-900">
        Create invite link
      </h2>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label htmlFor="invite-role" className={DASH_LABEL_CLASS}>
          Role
          <DashSelect id="invite-role" name="role" defaultValue="guest">
            {INVITE_ROLES.map((role) => (
              <option key={role} value={role}>
                {INVITE_ROLE_LABELS[role]}
              </option>
            ))}
          </DashSelect>
        </label>
        <label htmlFor="invite-expiry" className={DASH_LABEL_CLASS}>
          Expires in
          <DashSelect
            id="invite-expiry"
            name="expiresInDays"
            defaultValue={String(DEFAULT_EXPIRY_DAYS)}
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.days} value={String(option.days)}>
                {option.label}
              </option>
            ))}
          </DashSelect>
        </label>
      </div>
      {state.error === null ? null : (
        <p id="invite-create-error" role="alert" className={DASH_ERROR_CLASS}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${DASH_BUTTON_PRIMARY_CLASS} w-fit`}>
        {pending ? "Creating..." : "Create invite link"}
      </button>
    </form>
  );
}
