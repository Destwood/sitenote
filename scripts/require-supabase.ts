import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AUTH_HEALTH_URL = "http://127.0.0.1:54321/auth/v1/health";
const MAILPIT_INFO_URL = "http://127.0.0.1:54324/api/v1/info";
const WEB_ENV_FILE = "apps/web/.env.local";
const TIMEOUT_MS = 3000;

async function isReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return response.ok || response.status === 401;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const problems: string[] = [];
  if (!(await isReachable(AUTH_HEALTH_URL))) {
    problems.push(`Supabase Auth does not answer at ${AUTH_HEALTH_URL}. Run "pnpm db:start".`);
  }
  if (!(await isReachable(MAILPIT_INFO_URL))) {
    problems.push(
      `Mailpit does not answer at ${MAILPIT_INFO_URL}. Run "pnpm db:start" (do not exclude the mailpit service).`,
    );
  }
  if (!existsSync(resolve(ROOT, WEB_ENV_FILE))) {
    problems.push(`${WEB_ENV_FILE} is missing. Run "pnpm db:env".`);
  }
  if (problems.length > 0) {
    process.stderr.write(
      `End-to-end tests need the local Supabase stack:\n- ${problems.join("\n- ")}\n`,
    );
    process.exit(1);
  }
}

await main();
