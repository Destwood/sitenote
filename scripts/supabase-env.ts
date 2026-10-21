import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_URL = "http://localhost:3000";
const STATUS_LINE = /^([A-Z0-9_]+)="(.*)"$/;
const ENV_ASSIGNMENT = /^\s*([A-Z0-9_]+)\s*=/;

interface EnvTarget {
  file: string;
  variables: Record<string, string>;
}

function readStatus(): Map<string, string> {
  const result = spawnSync("supabase status -o env", {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `supabase status failed. Start the local stack with "pnpm db:start" first.\n${result.stderr}`,
    );
  }
  const status = new Map<string, string>();
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = STATUS_LINE.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) {
      status.set(match[1], match[2]);
    }
  }
  return status;
}

function required(status: Map<string, string>, key: string): string {
  const value = status.get(key);
  if (value === undefined || value === "") {
    throw new Error(`supabase status did not report ${key}`);
  }
  return value;
}

function mergeEnv(existing: string, variables: Record<string, string>): string {
  const pending = new Map(Object.entries(variables));
  const lines = existing === "" ? [] : existing.replace(/\r?\n$/, "").split(/\r?\n/);
  const merged = lines.map((line) => {
    const key = ENV_ASSIGNMENT.exec(line)?.[1];
    const value = key === undefined ? undefined : pending.get(key);
    if (key === undefined || value === undefined) {
      return line;
    }
    pending.delete(key);
    return `${key}=${value}`;
  });
  for (const [key, value] of pending) {
    merged.push(`${key}=${value}`);
  }
  return `${merged.join("\n")}\n`;
}

function main(): void {
  const status = readStatus();
  const url = required(status, "API_URL");
  const publishableKey = required(status, "PUBLISHABLE_KEY");
  const secretKey = required(status, "SECRET_KEY");
  const dbUrl = required(status, "DB_URL");

  const targets: EnvTarget[] = [
    {
      file: "apps/web/.env.local",
      variables: {
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
        SUPABASE_SECRET_KEY: secretKey,
        NEXT_PUBLIC_WEB_URL: WEB_URL,
      },
    },
    {
      file: "apps/extension/.env.local",
      variables: {
        WXT_SUPABASE_URL: url,
        WXT_SUPABASE_PUBLISHABLE_KEY: publishableKey,
        WXT_WEB_URL: WEB_URL,
      },
    },
    {
      file: "packages/db/.env.local",
      variables: {
        SUPABASE_URL: url,
        SUPABASE_PUBLISHABLE_KEY: publishableKey,
        SUPABASE_SECRET_KEY: secretKey,
        SUPABASE_DB_URL: dbUrl,
      },
    },
  ];

  for (const target of targets) {
    const path = resolve(ROOT, target.file);
    const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
    writeFileSync(path, mergeEnv(existing, target.variables));
    process.stdout.write(`wrote ${relative(ROOT, path).replaceAll("\\", "/")}\n`);
  }
}

main();
