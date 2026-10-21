"use client";

import { useActionState } from "react";

import { createWorkspace, type CreateWorkspaceState } from "../create-workspace";
import { ERROR_CLASS, INPUT_CLASS, PRIMARY_BUTTON_CLASS } from "../form-controls";
import { WORKSPACE_NAME_MAX_LENGTH } from "../workspace-name";

const INITIAL_STATE: CreateWorkspaceState = { error: null, name: "" };

export function CreateWorkspaceForm() {
  const [state, formAction, pending] = useActionState(createWorkspace, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3" aria-labelledby="create-heading">
      <h2 id="create-heading" className="text-lg font-semibold">
        Create workspace
      </h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="workspace-name" className="text-sm font-medium text-neutral-700">
          Workspace name
        </label>
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
          className={INPUT_CLASS}
        />
      </div>
      {state.error === null ? null : (
        <p id="workspace-error" role="alert" className={ERROR_CLASS}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${PRIMARY_BUTTON_CLASS} w-fit`}>
        {pending ? "Creating..." : "Create workspace"}
      </button>
    </form>
  );
}
