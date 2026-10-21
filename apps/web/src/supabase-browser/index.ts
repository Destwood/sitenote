import type { Database, SitenoteClient } from "@sitenote/db";
import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "../env";

let client: SitenoteClient | undefined;

export function getSupabaseBrowserClient(): SitenoteClient {
  if (client === undefined) {
    const env = getPublicEnv();
    client = createBrowserClient<Database>(env.supabaseUrl, env.supabasePublishableKey);
  }
  return client;
}
