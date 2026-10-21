"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { describeInviteError } from "../invite-error";
import { inviteSignInPath, isInviteToken, workspaceInvitesPath } from "../invite-link";
import { parseExpiryDays, parseInviteRole, toInterval } from "../invite-options";
import { createSupabaseServerClient, getAuthenticatedUser } from "../supabase-server";
import { parseUuid } from "../uuid";

export interface InviteActionState {
  error: string | null;
}

const OWNER_ONLY_CODE = "42501";

export async function createInvite(
  _previous: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const workspaceId = parseUuid(formData.get("workspaceId"));
  const role = parseInviteRole(formData.get("role"));
  const days = parseExpiryDays(formData.get("expiresInDays"));
  if (workspaceId === null || role === null || days === null) {
    return { error: "Choose a role and an expiry for the invite." };
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect(`/sign-in?next=${encodeURIComponent(workspaceInvitesPath(workspaceId))}`);
  }

  const { error } = await supabase.rpc("create_invite", {
    p_workspace_id: workspaceId,
    p_role: role,
    p_expires_in: toInterval(days),
  });
  if (error !== null) {
    return {
      error:
        error.code === OWNER_ONLY_CODE
          ? "Only the workspace owner can create invites."
          : "We could not create the invite. Try again.",
    };
  }

  revalidatePath(workspaceInvitesPath(workspaceId));
  return { error: null };
}

export async function revokeInvite(
  _previous: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const workspaceId = parseUuid(formData.get("workspaceId"));
  const inviteId = parseUuid(formData.get("inviteId"));
  if (workspaceId === null || inviteId === null) {
    return { error: "We could not revoke the invite. Reload the page and try again." };
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect(`/sign-in?next=${encodeURIComponent(workspaceInvitesPath(workspaceId))}`);
  }

  const { data, error } = await supabase
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .select("id");
  if (error !== null) {
    return { error: "We could not revoke the invite. Try again." };
  }
  if (data.length === 0) {
    return { error: "This invite was already revoked or no longer exists." };
  }

  revalidatePath(workspaceInvitesPath(workspaceId));
  return { error: null };
}

export async function acceptInvite(
  _previous: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const token = formData.get("token");
  if (typeof token !== "string" || !isInviteToken(token)) {
    return { error: describeInviteError("22023") };
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect(inviteSignInPath(token));
  }
  if (user.isAnonymous) {
    return { error: describeInviteError("42501") };
  }

  const { error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error !== null) {
    return { error: describeInviteError(error.code) };
  }

  revalidatePath("/app");
  redirect("/app");
}
