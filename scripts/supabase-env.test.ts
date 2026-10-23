import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readCloudStatus } from "./supabase-env";

const URL_VALUE = "https://abcdefgh.supabase.co";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "sitenote-env-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function writeEnvFile(content: string): string {
  const path = join(directory, ".env.cloud");
  writeFileSync(path, content);
  return path;
}

describe("readCloudStatus", () => {
  it("maps the cloud keys to the status names, skipping comments and unrelated keys", () => {
    const path = writeEnvFile(
      [
        "# cloud project",
        `SUPABASE_URL=${URL_VALUE}`,
        'SUPABASE_PUBLISHABLE_KEY="sb_publishable_test"',
        "SUPABASE_SECRET_KEY=sb_secret_test==",
        "SUPABASE_DB_PASSWORD=not-used",
        "",
      ].join("\n"),
    );

    expect(readCloudStatus(path)).toEqual(
      new Map([
        ["API_URL", URL_VALUE],
        ["PUBLISHABLE_KEY", "sb_publishable_test"],
        ["SECRET_KEY", "sb_secret_test=="],
      ]),
    );
  });

  it("names the missing or empty keys without printing any value", () => {
    const path = writeEnvFile(`SUPABASE_URL=${URL_VALUE}\nSUPABASE_PUBLISHABLE_KEY=\n`);

    expect(() => readCloudStatus(path)).toThrow(
      new Error(".env.cloud needs a value for SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY."),
    );
  });

  it("fails clearly when the file does not exist", () => {
    expect(() => readCloudStatus(join(directory, ".env.cloud"))).toThrow(
      ".env.cloud not found. Copy .env.cloud.example and fill in the values.",
    );
  });
});
