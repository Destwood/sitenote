"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient, getAuthenticatedUser } from "../supabase-server";
import { parseUuid } from "../uuid";
import { threadPath, workspacePath } from "../workspace-paths";

export interface ThreadActionState {
  error: string | null;
}

const STATUS_TARGETS = ["open", "resolved"] as const;

const UPDATE_FAILED = "We could not update the thread. Try again.";
const NOT_ALLOWED = "You cannot change the status of this thread.";
const INVALID_REQUEST = "We could not update the thread. Reload the page and try again.";

export async function setThreadStatus(
  _previous: ThreadActionState,
  formData: FormData,
): Promise<ThreadActionState> {
  const workspaceId = parseUuid(formData.get("workspaceId"));
  const threadId = parseUuid(formData.get("threadId"));
  const status = STATUS_TARGETS.find((target) => target === formData.get("status"));
  if (workspaceId === null || threadId === null || status === undefined) {
    return { error: INVALID_REQUEST };
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect(`/sign-in?next=${encodeURIComponent(threadPath(workspaceId, threadId))}`);
  }

  const { data, error } = await supabase
    .from("threads")
    .update({ status })
    .eq("id", threadId)
    .eq("workspace_id", workspaceId)
    .select("id");
  if (error !== null) {
    return { error: UPDATE_FAILED };
  }
  if (data.length === 0) {
    return { error: NOT_ALLOWED };
  }

  revalidatePath(threadPath(workspaceId, threadId));
  revalidatePath(workspacePath(workspaceId, "threads"));
  return { error: null };
}
