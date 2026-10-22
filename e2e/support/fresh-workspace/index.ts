import { createSitenoteClient, type SitenoteClient } from "@sitenote/db";
import { randomUUID } from "node:crypto";

import { clearMailbox, waitForOtpCode } from "../mailpit";
import { readSupabaseEnv } from "../supabase-env";

const OTP_INTERVAL_MS = 1100;

export interface FreshUser {
  client: SitenoteClient;
  id: string;
  email: string;
  displayName: string;
}

export interface FreshWorkspace {
  owner: FreshUser;
  member: FreshUser;
  workspaceId: string;
  workspaceName: string;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function createFreshUser(displayName: string): Promise<FreshUser> {
  const { url, publishableKey } = readSupabaseEnv();
  const email = `e2e-${randomUUID()}@sitenote.test`;
  const client = createSitenoteClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  await clearMailbox(email);
  const sent = await client.auth.signInWithOtp({ email });
  if (sent.error !== null) {
    throw new Error(`Sending the code to ${email} failed: ${sent.error.message}`);
  }
  const verified = await client.auth.verifyOtp({
    email,
    token: await waitForOtpCode(email),
    type: "email",
  });
  if (verified.error !== null || verified.data.user === null) {
    throw new Error(`Verifying the code for ${email} failed`);
  }
  const id = verified.data.user.id;
  const renamed = await client
    .from("profiles")
    .update({ display_name: displayName })
    .eq("user_id", id);
  if (renamed.error !== null) {
    throw new Error(`Naming ${email} failed: ${renamed.error.message}`);
  }
  await sleep(OTP_INTERVAL_MS);
  return { client, id, email, displayName };
}

export async function createFreshWorkspace(
  ownerName: string,
  memberName: string,
): Promise<FreshWorkspace> {
  const owner = await createFreshUser(ownerName);
  const member = await createFreshUser(memberName);
  const workspaceName = `Mentions ${randomUUID().slice(0, 8)}`;
  const created = await owner.client
    .from("workspaces")
    .insert({ name: workspaceName, owner_id: owner.id })
    .select("id")
    .single();
  if (created.error !== null) {
    throw new Error(`Creating the workspace failed: ${created.error.message}`);
  }
  const workspaceId = created.data.id;
  const invite = await owner.client.rpc("create_invite", {
    p_workspace_id: workspaceId,
    p_role: "member",
  });
  if (invite.error !== null) {
    throw new Error(`Creating the invite failed: ${invite.error.message}`);
  }
  const accepted = await member.client.rpc("accept_invite", { p_token: invite.data.token });
  if (accepted.error !== null) {
    throw new Error(`Joining the workspace failed: ${accepted.error.message}`);
  }
  return { owner, member, workspaceId, workspaceName };
}

export async function deleteFreshWorkspace(workspace: FreshWorkspace): Promise<void> {
  const { error } = await workspace.owner.client
    .from("workspaces")
    .delete()
    .eq("id", workspace.workspaceId);
  if (error !== null) {
    throw new Error(`Deleting the workspace failed: ${error.message}`);
  }
}
