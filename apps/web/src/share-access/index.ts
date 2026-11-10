import { createSitenoteClient, type SitenoteClient } from "@sitenote/db";

import { getPublicEnv } from "../env";
import { getServerEnv } from "../server-env";
import { readThreadDetail, type ThreadDetail } from "../thread-detail";

const SHARE_TOKEN = /^[0-9a-f]{64}$/;
const SEPARATE_SESSION_AUTH = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};

export interface ThreadShare {
  token: string;
  expiresAt: string;
}

export function parseShareToken(raw: string): string | null {
  return SHARE_TOKEN.test(raw) ? raw : null;
}

export async function readSharedThread(token: string): Promise<ThreadDetail | null> {
  const validToken = parseShareToken(token);
  if (validToken === null) {
    return null;
  }
  const env = getPublicEnv();
  const admin = createSitenoteClient(env.supabaseUrl, getServerEnv().secretKey, {
    auth: SEPARATE_SESSION_AUTH,
  });
  const { data, error } = await admin
    .from("thread_shares")
    .select("thread_id")
    .eq("token", validToken)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error !== null) {
    throw new Error("Could not read the shared thread.");
  }
  return data === null ? null : readThreadDetail(admin, data.thread_id);
}

export async function readThreadShare(
  supabase: SitenoteClient,
  threadId: string,
): Promise<ThreadShare | null> {
  const { data, error } = await supabase
    .from("thread_shares")
    .select("token, expires_at")
    .eq("thread_id", threadId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error !== null) {
    throw new Error("Could not read the thread share.");
  }
  return data === null ? null : { token: data.token, expiresAt: data.expires_at };
}
