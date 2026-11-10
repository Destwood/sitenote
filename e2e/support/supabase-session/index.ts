import type { BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

import { SEEDED_PASSWORD } from "../seeded-user";
import { readSupabaseEnv } from "../supabase-env";

type Cookies = Parameters<BrowserContext["addCookies"]>[0];

export function anonymousSessionCookies(domain: string): Promise<Cookies> {
  return sessionCookies(domain);
}

export function seededSessionCookies(domain: string, email: string): Promise<Cookies> {
  return sessionCookies(domain, email);
}

async function sessionCookies(domain: string, email?: string): Promise<Cookies> {
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

  const { error } =
    email === undefined
      ? await supabase.auth.signInAnonymously()
      : await supabase.auth.signInWithPassword({ email, password: SEEDED_PASSWORD });
  if (error !== null) {
    throw new Error(`Test session sign-in failed: ${error.message}`);
  }
  return [...jar].map(([name, value]) => ({
    name,
    value,
    domain,
    path: "/",
    sameSite: "Lax",
  }));
}
