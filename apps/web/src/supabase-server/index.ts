import type { Database, SitenoteClient } from "@sitenote/db";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "../env";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
}

export async function createSupabaseServerClient(): Promise<SitenoteClient> {
  const cookieStore = await cookies();
  const env = getPublicEnv();
  return createServerClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          return;
        }
      },
    },
  });
}

export async function getAuthenticatedUser(
  supabase: SitenoteClient,
): Promise<AuthenticatedUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error !== null || data === null) {
    return null;
  }
  const { sub, email, is_anonymous: isAnonymous } = data.claims;
  return {
    id: sub,
    email: email !== undefined && email !== "" ? email : null,
    isAnonymous: isAnonymous === true,
  };
}
