import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { format, resolveConfig } from "prettier";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "packages/db/src/database-types/index.ts");

async function main(): Promise<void> {
  const result = spawnSync("supabase gen types typescript --local --schema public", {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || result.stdout.trim() === "") {
    throw new Error(
      `supabase gen types failed. Start the local stack with "pnpm db:start" first.\n${result.stderr}`,
    );
  }
  const options = await resolveConfig(OUTPUT);
  const formatted = await format(result.stdout, { ...options, filepath: OUTPUT });
  writeFileSync(OUTPUT, formatted);
  process.stdout.write(`wrote ${relative(ROOT, OUTPUT).replaceAll("\\", "/")}\n`);
}

await main();
