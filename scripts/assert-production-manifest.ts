import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = resolve(ROOT, "apps/extension/.output/chrome-mv3/manifest.json");
const OPTIONAL_HOSTS = ["http://*/*", "https://*/*"];
const FORBIDDEN_TEXT = ["127.0.0.1", "localhost", "example.com", "<all_urls>"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function problemsOf(raw: string): string[] {
  const manifest: unknown = JSON.parse(raw);
  if (!isRecord(manifest)) {
    return ["The manifest is not a JSON object."];
  }
  const problems: string[] = [];
  if (manifest.host_permissions !== undefined) {
    problems.push("host_permissions must not exist in the production manifest.");
  }
  if (manifest.content_scripts !== undefined) {
    problems.push("content_scripts must not exist: content scripts are registered at runtime.");
  }
  if (JSON.stringify(manifest.optional_host_permissions) !== JSON.stringify(OPTIONAL_HOSTS)) {
    problems.push(`optional_host_permissions must be exactly ${JSON.stringify(OPTIONAL_HOSTS)}.`);
  }
  for (const text of FORBIDDEN_TEXT) {
    if (raw.includes(text)) {
      problems.push(`The manifest must not mention ${text}.`);
    }
  }
  return problems;
}

function main(): void {
  const problems = problemsOf(readFileSync(MANIFEST, "utf8"));
  if (problems.length > 0) {
    process.stderr.write(`Unexpected production manifest:\n- ${problems.join("\n- ")}\n`);
    process.exit(1);
  }
  process.stdout.write("The production manifest has no host permissions at install time.\n");
}

main();
