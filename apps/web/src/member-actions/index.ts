"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ConfirmActionState } from "../confirm-action-form";
import { parseAssignableRole } from "../member-roles";
import { createSupabaseServerClient, getAuthenticatedUser } from "../supabase-server";
import { parseUuid } from "../uuid";
import { workspacePath } from "../workspace-paths";

const INVALID_REQUEST = "We could not update the member. Reload the page and try again.";
const UPDATE_FAILED = "We could not update the member. Try again.";
const OWNER_ONLY = "Only the workspace owner can change members.";
const LEAVE_FAILED = "We could not leave the workspace. Try again.";
const CANNOT_LEAVE = "You cannot leave this workspace.";

export async function setMemberRole(
  _previous: ConfirmActionState,
  formData: FormData,
): Promise<ConfirmActionState> {
  const workspaceId = parseUuid(formData.get("workspaceId"));
  const userId = parseUuid(formData.get("userId"));
  const role = parseAssignableRole(formData.get("role"));
  if (workspaceId === null || userId === null || role === null) {
    return { error: INVALID_REQUEST };
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect(`/sign-in?next=${encodeURIComponent(workspacePath(workspaceId, "members"))}`);
  }

  const { data, error } = await supabase
    .from("members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select("id");
  if (error !== null) {
    return { error: UPDATE_FAILED };
  }
  if (data.length === 0) {
    return { error: OWNER_ONLY };
  }

  revalidatePath(workspacePath(workspaceId, "members"));
  return { error: null };
}

export async function removeMember(
  _previous: ConfirmActionState,
  formData: FormData,
): Promise<ConfirmActionState> {
  const workspaceId = parseUuid(formData.get("workspaceId"));
  const userId = parseUuid(formData.get("userId"));
  if (workspaceId === null || userId === null) {
    return { error: INVALID_REQUEST };
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect(`/sign-in?next=${encodeURIComponent(workspacePath(workspaceId, "members"))}`);
  }

  const { data, error } = await supabase
    .from("members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select("id");
  if (error !== null) {
    return { error: UPDATE_FAILED };
  }
  if (data.length === 0) {
    return { error: OWNER_ONLY };
  }

  revalidatePath(workspacePath(workspaceId, "members"));
  return { error: null };
}

export async function leaveWorkspace(
  _previous: ConfirmActionState,
  formData: FormData,
): Promise<ConfirmActionState> {
  const workspaceId = parseUuid(formData.get("workspaceId"));
  if (workspaceId === null) {
    return { error: INVALID_REQUEST };
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect(`/sign-in?next=${encodeURIComponent(workspacePath(workspaceId, "members"))}`);
  }

  const { data, error } = await supabase
    .from("members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .select("id");
  if (error !== null) {
    return { error: LEAVE_FAILED };
  }
  if (data.length === 0) {
    return { error: CANNOT_LEAVE };
  }

  revalidatePath("/app");
  redirect("/app");
}
