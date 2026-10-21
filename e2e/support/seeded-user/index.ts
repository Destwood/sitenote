import { createSitenoteClient, type SitenoteClient } from "@sitenote/db";

import { readSupabaseEnv } from "../supabase-env";

export const SEEDED_PASSWORD = "sitenote-dev-password";

export async function signInSeededUser(email: string): Promise<SitenoteClient> {
  const { url, publishableKey } = readSupabaseEnv();
  const client = createSitenoteClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: SEEDED_PASSWORD });
  if (error !== null) {
    throw new Error(`Seeded sign-in failed for ${email}: ${error.message}`);
  }
  return client;
}
