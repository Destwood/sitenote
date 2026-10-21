import type { BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

type Cookies = Parameters<BrowserContext["addCookies"]>[0];

const WEB_ENV_FILE = resolve(import.meta.dirname, "../../../apps/web/.env.local");

function requireValue(
  name: string,
  fromFile: Readonly<Record<string, string | undefined>>,
): string {
  const value = process.env[name] ?? fromFile[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set. Run "pnpm db:start" and then "pnpm db:env".`);
  }
  return value;
}

export async function anonymousSessionCookies(domain: string): Promise<Cookies> {
  const fromFile = existsSync(WEB_ENV_FILE) ? parseEnv(readFileSync(WEB_ENV_FILE, "utf8")) : {};
  const url = requireValue("NEXT_PUBLIC_SUPABASE_URL", fromFile);
  const key = requireValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", fromFile);

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
