"use client";

import { useActionState } from "react";

import { createWorkspace, type CreateWorkspaceState } from "../create-workspace";
import {
  DASH_BUTTON_PRIMARY_CLASS,
  DASH_CARD_CLASS,
  DASH_ERROR_CLASS,
  DASH_INPUT_CLASS,
  DASH_LABEL_CLASS,
} from "../dashboard-classes";
import { WORKSPACE_NAME_MAX_LENGTH } from "../workspace-name";

const INITIAL_STATE: CreateWorkspaceState = { error: null, name: "" };

export function CreateWorkspaceForm() {
  const [state, formAction, pending] = useActionState(createWorkspace, INITIAL_STATE);

  return (
    <form
      action={formAction}
      className={`${DASH_CARD_CLASS} flex flex-col gap-4 p-5`}
      aria-labelledby="create-heading"
    >
      <h2 id="create-heading" className="text-base font-semibold text-neutral-900">
        Create workspace
      </h2>
      <label htmlFor="workspace-name" className={DASH_LABEL_CLASS}>
        Workspace name
        <input
          id="workspace-name"
          name="name"
          type="text"
          required
          maxLength={WORKSPACE_NAME_MAX_LENGTH}
          autoComplete="off"
          defaultValue={state.name}
          aria-invalid={state.error !== null}
          aria-describedby={state.error === null ? undefined : "workspace-error"}
          className={DASH_INPUT_CLASS}
        />
      </label>
      {state.error === null ? null : (
        <p id="workspace-error" role="alert" className={DASH_ERROR_CLASS}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${DASH_BUTTON_PRIMARY_CLASS} w-fit`}>
        {pending ? "Creating..." : "Create workspace"}
      </button>
    </form>
  );
}
