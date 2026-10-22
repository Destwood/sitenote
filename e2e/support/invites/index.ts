import type { SitenoteClient } from "@sitenote/db";

import { WEB_ORIGIN } from "../web-auth";

export const SEEDED_WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
export const INVALID_INVITE_TEXT = "This invite link is invalid or has expired.";

type InviteRole = "member" | "guest";

export function inviteUrl(token: string): string {
  return `${WEB_ORIGIN}/invite/${token}`;
}

export async function createInviteToken(
  client: SitenoteClient,
  workspaceId: string,
  role: InviteRole,
  expiresIn = "7 days",
): Promise<string> {
  const { data, error } = await client.rpc("create_invite", {
    p_workspace_id: workspaceId,
    p_role: role,
    p_expires_in: expiresIn,
  });
  if (error !== null) {
    throw new Error(`create_invite failed: ${error.message}`);
  }
  return data.token;
}

export async function revokeInviteToken(client: SitenoteClient, token: string): Promise<void> {
  const { error } = await client
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", token);
  if (error !== null) {
    throw new Error(`Revoking the invite failed: ${error.message}`);
  }
}

export async function removeGuestsNamed(owner: SitenoteClient, displayName: string): Promise<void> {
  const { data, error } = await owner
    .from("profiles")
    .select("user_id")
    .eq("display_name", displayName);
  if (error !== null) {
    throw new Error(`Reading the guest profiles failed: ${error.message}`);
  }
  const ids = data.map((profile) => profile.user_id);
  if (ids.length === 0) {
    return;
  }
  const removed = await owner
    .from("members")
    .delete()
    .eq("workspace_id", SEEDED_WORKSPACE_ID)
    .eq("role", "guest")
    .in("user_id", ids);
  if (removed.error !== null) {
    throw new Error(`Removing the guests failed: ${removed.error.message}`);
  }
}
