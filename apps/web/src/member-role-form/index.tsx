"use client";

import { useActionState, useId } from "react";

import type { ConfirmActionState } from "../confirm-action-form";
import { ERROR_CLASS, INPUT_CLASS, SECONDARY_BUTTON_CLASS } from "../form-controls";
import { setMemberRole } from "../member-actions";
import { ASSIGNABLE_ROLES, MEMBER_ROLE_LABELS, type AssignableRole } from "../member-roles";

const INITIAL_STATE: ConfirmActionState = { error: null };

interface MemberRoleFormProps {
  workspaceId: string;
  userId: string;
  role: AssignableRole;
}

export function MemberRoleForm({ workspaceId, userId, role }: MemberRoleFormProps) {
  const [state, formAction, pending] = useActionState(setMemberRole, INITIAL_STATE);
  const selectId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="text-sm font-medium text-neutral-700">
          Role
        </label>
        <select id={selectId} name="role" defaultValue={role} className={`${INPUT_CLASS} w-auto`}>
          {ASSIGNABLE_ROLES.map((option) => (
            <option key={option} value={option}>
              {MEMBER_ROLE_LABELS[option]}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={SECONDARY_BUTTON_CLASS}>
          {pending ? "Saving..." : "Save role"}
        </button>
      </div>
      {state.error === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {state.error}
        </p>
      )}
    </form>
  );
}
