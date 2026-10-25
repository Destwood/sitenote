import { describe, expect, it } from "vitest";

import { parseServerEnv } from ".";

const MESSAGE =
  'Invalid or missing environment variables: SUPABASE_SECRET_KEY. Run "pnpm db:env" or copy .env.example.';

describe("parseServerEnv", () => {
  it("reads the secret key", () => {
    expect(parseServerEnv({ SUPABASE_SECRET_KEY: "sb_secret_key" })).toEqual({
      secretKey: "sb_secret_key",
    });
  });

  it("names the missing key", () => {
    expect(() => parseServerEnv({})).toThrow(MESSAGE);
  });

  it("treats an empty key as missing", () => {
    expect(() => parseServerEnv({ SUPABASE_SECRET_KEY: "" })).toThrow(MESSAGE);
  });
});
