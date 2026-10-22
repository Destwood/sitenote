import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = resolve(ROOT, "apps/extension/.output/chrome-mv3/manifest.json");
const EXTENSION_ENV_FILE = resolve(ROOT, "apps/extension/.env.local");
const OPTIONAL_HOSTS = ["http://*/*", "https://*/*"];
const FORBIDDEN_TEXT = ["127.0.0.1", "localhost", "example.com", "<all_urls>"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function configuredWebUrl(): string | undefined {
  const fromFile = existsSync(EXTENSION_ENV_FILE)
    ? parseEnv(readFileSync(EXTENSION_ENV_FILE, "utf8"))
    : {};
  const value = process.env.WXT_WEB_URL ?? fromFile.WXT_WEB_URL;
  return value === undefined || value === "" ? undefined : value;
}

function expectedConnectable(webUrl: string | undefined): string | null {
  const url = webUrl === undefined ? null : URL.parse(webUrl);
  return url === null ? null : `${url.origin}/*`;
}

function problemsOf(raw: string, webUrl: string | undefined): string[] {
  const manifest: unknown = JSON.parse(raw);
  if (!isRecord(manifest)) {
    return ["The manifest is not a JSON object."];
  }
  const problems: string[] = [];
  const expected = expectedConnectable(webUrl);
  if (expected === null) {
    problems.push("WXT_WEB_URL must be set to a valid URL to check externally_connectable.");
  } else if (
    JSON.stringify(manifest.externally_connectable) !== JSON.stringify({ matches: [expected] })
  ) {
    problems.push(
      `externally_connectable must be exactly {"matches":[${JSON.stringify(expected)}]}.`,
    );
  }
  const scannedText = JSON.stringify(
    Object.fromEntries(
      Object.entries(manifest).filter(([key]) => key !== "externally_connectable"),
    ),
  );
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
    if (scannedText.includes(text)) {
      problems.push(`The manifest must not mention ${text}.`);
    }
  }
  return problems;
}

function main(): void {
  const problems = problemsOf(readFileSync(MANIFEST, "utf8"), configuredWebUrl());
  if (problems.length > 0) {
    process.stderr.write(`Unexpected production manifest:\n- ${problems.join("\n- ")}\n`);
    process.exit(1);
  }
  process.stdout.write("The production manifest has no host permissions at install time.\n");
}

main();
