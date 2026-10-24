import { createSitenoteClient, type SitenoteClient } from "@sitenote/db";

import { getPublicEnv } from "../env";

export const DEMO_WORKSPACE_ID = "00000000-0000-4000-8000-00000000d3e0";
export const DEMO_STORAGE_KEY = "sitenote-demo";

let client: SitenoteClient | undefined;

export function getDemoSupabaseClient(): SitenoteClient {
  if (client === undefined) {
    const env = getPublicEnv();
    client = createSitenoteClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: {
        storageKey: DEMO_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
