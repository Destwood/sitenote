import type { BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

import { readSupabaseEnv } from "../supabase-env";

type Cookies = Parameters<BrowserContext["addCookies"]>[0];

export async function anonymousSessionCookies(domain: string): Promise<Cookies> {
  const { url, publishableKey: key } = readSupabaseEnv();

  const jar = new Map<string, string>();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          if (value === "") {
            jar.delete(name);
          } else {
            jar.set(name, value);
          }
        }
      },
    },
  });

  const { error } = await supabase.auth.signInAnonymously();
  if (error !== null) {
    throw new Error(`Anonymous sign-in failed: ${error.message}`);
  }
  return [...jar].map(([name, value]) => ({
    name,
    value,
    domain,
    path: "/",
    sameSite: "Lax",
  }));
}
