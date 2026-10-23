"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ConfirmActionState } from "../confirm-action-form";
import { createSupabaseServerClient, getAuthenticatedUser } from "../supabase-server";
import { parseUuid } from "../uuid";
import { workspacePath } from "../workspace-paths";

const INVALID_REQUEST = "We could not remove the site. Reload the page and try again.";
const REMOVE_FAILED = "We could not remove the site. Try again.";
const OWNER_ONLY = "Only the workspace owner can remove a site.";

export async function removeSite(
  _previous: ConfirmActionState,
  formData: FormData,
): Promise<ConfirmActionState> {
  const workspaceId = parseUuid(formData.get("workspaceId"));
  const siteId = parseUuid(formData.get("siteId"));
  if (workspaceId === null || siteId === null) {
    return { error: INVALID_REQUEST };
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect(`/sign-in?next=${encodeURIComponent(workspacePath(workspaceId, "sites"))}`);
  }

  const { data, error } = await supabase
    .from("sites")
    .delete()
    .eq("id", siteId)
    .eq("workspace_id", workspaceId)
    .select("id");
  if (error !== null) {
    return { error: REMOVE_FAILED };
  }
  if (data.length === 0) {
    return { error: OWNER_ONLY };
  }

  revalidatePath(workspacePath(workspaceId, "sites"));
  revalidatePath(workspacePath(workspaceId, "threads"));
  return { error: null };
}
