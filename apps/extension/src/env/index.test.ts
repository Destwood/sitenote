import { describe, expect, it } from "vitest";

import { parseExtensionEnv } from ".";

const VALID = {
  WXT_SUPABASE_URL: "http://127.0.0.1:54321",
  WXT_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_key",
  WXT_WEB_URL: "http://localhost:3000",
};

describe("parseExtensionEnv", () => {
  it("parses the required variables and defaults Google sign-in to off", () => {
    expect(parseExtensionEnv(VALID)).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "sb_publishable_key",
      webUrl: "http://localhost:3000",
      googleAuthEnabled: false,
    });
  });

  it("enables Google sign-in only for the exact value true", () => {
    expect(parseExtensionEnv({ ...VALID, WXT_AUTH_GOOGLE_ENABLED: "true" }).googleAuthEnabled).toBe(
      true,
    );
    expect(
      parseExtensionEnv({ ...VALID, WXT_AUTH_GOOGLE_ENABLED: "false" }).googleAuthEnabled,
    ).toBe(false);
  });

  it("treats empty values as unset", () => {
    expect(parseExtensionEnv({ ...VALID, WXT_AUTH_GOOGLE_ENABLED: "" }).googleAuthEnabled).toBe(
      false,
    );
  });

  it("rejects an unknown Google flag value", () => {
    expect(() => parseExtensionEnv({ ...VALID, WXT_AUTH_GOOGLE_ENABLED: "yes" })).toThrow(
      "WXT_AUTH_GOOGLE_ENABLED",
    );
  });

  it("names every missing variable", () => {
    expect(() => parseExtensionEnv({})).toThrow(
      /WXT_SUPABASE_URL, WXT_SUPABASE_PUBLISHABLE_KEY, WXT_WEB_URL/,
    );
  });

  it("rejects a malformed web URL", () => {
    expect(() => parseExtensionEnv({ ...VALID, WXT_WEB_URL: "not a url" })).toThrow("WXT_WEB_URL");
  });

  it("never leaks the values in the error message", () => {
    let message = "";
    try {
      parseExtensionEnv({ ...VALID, WXT_SUPABASE_URL: "secret-looking-value" });
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).toContain("WXT_SUPABASE_URL");
    expect(message).not.toContain("secret-looking-value");
  });
});
