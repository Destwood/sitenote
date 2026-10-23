import { SECONDARY_BUTTON } from "../control-classes";

export interface ClickUpTaskState {
  taskUrl: string | null;
  canCreate: boolean;
  pending: boolean;
  onCreate: () => void;
}

export function ClickUpTask({ taskUrl, canCreate, pending, onCreate }: ClickUpTaskState) {
  if (taskUrl !== null) {
    return taskUrl.startsWith("https://") ? (
      <a
        href={taskUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-900 underline underline-offset-2"
      >
        ClickUp task
      </a>
    ) : null;
  }
  if (!canCreate) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={onCreate}
      disabled={pending}
      className={`${SECONDARY_BUTTON} w-fit`}
    >
      {pending ? "Creating the ClickUp task" : "Create ClickUp task"}
    </button>
  );
}
