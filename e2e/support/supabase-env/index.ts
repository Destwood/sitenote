import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const WEB_ENV_FILE = resolve(import.meta.dirname, "../../../apps/web/.env.local");

export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

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

export function readSupabaseEnv(): SupabaseEnv {
  const fromFile = existsSync(WEB_ENV_FILE) ? parseEnv(readFileSync(WEB_ENV_FILE, "utf8")) : {};
  return {
    url: requireValue("NEXT_PUBLIC_SUPABASE_URL", fromFile),
    publishableKey: requireValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", fromFile),
  };
}

export function readSupabaseSecret(): string {
  const fromFile = existsSync(WEB_ENV_FILE) ? parseEnv(readFileSync(WEB_ENV_FILE, "utf8")) : {};
  return requireValue("SUPABASE_SECRET_KEY", fromFile);
}
