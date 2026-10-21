import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

import { defineConfig } from "vitest/config";

const ENV_FILE = resolve(import.meta.dirname, ".env.local");
const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_DB_URL",
] as const;

function loadEnv(): Record<string, string> {
  const fromFile = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, "utf8")) : {};
  const env: Record<string, string> = {};
  for (const key of KEYS) {
    const value = process.env[key] ?? fromFile[key];
    if (value !== undefined && value !== "") {
      env[key] = value;
    }
  }
  return env;
}

export default defineConfig({
  test: {
    name: "db-rls",
    environment: "node",
    include: ["src/rls/**/*.rls.test.ts"],
    env: loadEnv(),
    maxWorkers: 2,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
