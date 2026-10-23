"use client";

import { useActionState } from "react";

import { ERROR_CLASS, SECONDARY_BUTTON_CLASS } from "../form-controls";

export interface ConfirmActionState {
  error: string | null;
}

export type ConfirmAction = (
  previous: ConfirmActionState,
  formData: FormData,
) => Promise<ConfirmActionState>;

const INITIAL_STATE: ConfirmActionState = { error: null };

interface ConfirmActionFormProps {
  action: ConfirmAction;
  fields: Readonly<Record<string, string>>;
  confirmMessage: string;
  label: string;
  pendingLabel: string;
}

export function ConfirmActionForm({
  action,
  fields,
  confirmMessage,
  label,
  pendingLabel,
}: ConfirmActionFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        disabled={pending}
        onClick={(event) => {
          if (!window.confirm(confirmMessage)) {
            event.preventDefault();
          }
        }}
        className={SECONDARY_BUTTON_CLASS}
      >
        {pending ? pendingLabel : label}
      </button>
      {state.error === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {state.error}
        </p>
      )}
    </form>
  );
}
