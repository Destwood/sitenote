"use client";

import type { Enums } from "@sitenote/db";
import { useActionState } from "react";

import { ERROR_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "../form-controls";
import { setThreadStatus, type ThreadActionState } from "../thread-actions";

const INITIAL_STATE: ThreadActionState = { error: null };

interface ThreadStatusFormProps {
  workspaceId: string;
  threadId: string;
  status: Enums<"thread_status">;
}

export function ThreadStatusForm({ workspaceId, threadId, status }: ThreadStatusFormProps) {
  const [state, formAction, pending] = useActionState(setThreadStatus, INITIAL_STATE);
  const isOpen = status === "open";

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="status" value={isOpen ? "resolved" : "open"} />
      <button
        type="submit"
        disabled={pending}
        className={isOpen ? PRIMARY_BUTTON_CLASS : SECONDARY_BUTTON_CLASS}
      >
        {pending ? "Saving..." : isOpen ? "Resolve thread" : "Reopen thread"}
      </button>
      {state.error === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {state.error}
        </p>
      )}
    </form>
  );
}
