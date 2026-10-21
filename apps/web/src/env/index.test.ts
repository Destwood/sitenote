import { describe, expect, it } from "vitest";

import { parsePublicEnv } from ".";

const VALID = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_key",
};

describe("parsePublicEnv", () => {
  it("parses the required variables and defaults Google sign-in to off", () => {
    expect(parsePublicEnv(VALID)).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "sb_publishable_key",
      googleAuthEnabled: false,
    });
  });

  it("enables Google sign-in only for the exact value true", () => {
    expect(
      parsePublicEnv({ ...VALID, NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "true" }).googleAuthEnabled,
    ).toBe(true);
    expect(
      parsePublicEnv({ ...VALID, NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "false" }).googleAuthEnabled,
    ).toBe(false);
  });

  it("treats empty values as unset", () => {
    expect(
      parsePublicEnv({ ...VALID, NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "" }).googleAuthEnabled,
    ).toBe(false);
  });

  it("rejects an unknown Google flag value", () => {
    expect(() => parsePublicEnv({ ...VALID, NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "yes" })).toThrow(
      "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED",
    );
  });

  it("names every missing variable", () => {
    expect(() => parsePublicEnv({})).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it("rejects a malformed Supabase URL", () => {
    expect(() => parsePublicEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL",
    );
  });

  it("never leaks the values in the error message", () => {
    expect(() =>
      parsePublicEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_URL: "secret-looking-value" }),
    ).not.toThrow(/secret-looking-value/);
  });
});
