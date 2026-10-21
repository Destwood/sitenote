import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";

import type { Database } from "../database-types";

export type SitenoteClient = SupabaseClient<Database>;

export type SitenoteClientOptions = SupabaseClientOptions<"public">;

export function createSitenoteClient(
  url: string,
  key: string,
  options?: SitenoteClientOptions,
): SitenoteClient {
  return createClient<Database>(url, key, options);
}
