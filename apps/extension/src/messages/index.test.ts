import { describe, expect, it } from "vitest";

import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  AUTH_RESPONSE_SCHEMAS,
  authRequestSchema,
  authStateChangedSchema,
  authStateSchema,
  failure,
  success,
} from ".";

const SIGNED_IN = {
  status: "signedIn",
  user: { id: "user-1", email: "a@b.test", displayName: "Ann", isAnonymous: false },
} as const;

describe("authRequestSchema", () => {
  it("accepts requests without a payload", () => {
    for (const type of ["auth.getState", "auth.signInWithGoogle", "auth.signOut"]) {
      expect(authRequestSchema.safeParse({ type }).success).toBe(true);
    }
  });

  it("accepts a send-code request and trims the email", () => {
    const result = authRequestSchema.safeParse({ type: "auth.sendCode", email: "  a@b.test " });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ type: "auth.sendCode", email: "a@b.test" });
  });

  it("accepts a verify-code request with six digits", () => {
    expect(
      authRequestSchema.safeParse({ type: "auth.verifyCode", email: "a@b.test", code: "012345" })
        .success,
    ).toBe(true);
  });

  it("strips unknown properties", () => {
    const result = authRequestSchema.safeParse({ type: "auth.signOut", extra: 1 });

    expect(result.data).toEqual({ type: "auth.signOut" });
  });

  it.each([
    ["a missing email", { type: "auth.sendCode" }],
    ["a malformed email", { type: "auth.sendCode", email: "not-an-email" }],
    ["an email that is too long", { type: "auth.sendCode", email: `${"a".repeat(250)}@b.test` }],
    ["a non-string email", { type: "auth.sendCode", email: 1 }],
    ["a short code", { type: "auth.verifyCode", email: "a@b.test", code: "12345" }],
    ["a long code", { type: "auth.verifyCode", email: "a@b.test", code: "1234567" }],
    ["a non-numeric code", { type: "auth.verifyCode", email: "a@b.test", code: "12345a" }],
    ["a code with a newline", { type: "auth.verifyCode", email: "a@b.test", code: "123456\n" }],
    ["a numeric code", { type: "auth.verifyCode", email: "a@b.test", code: 123456 }],
    ["an unknown type", { type: "auth.deleteEverything" }],
    ["a missing type", { email: "a@b.test" }],
    ["a string", "auth.getState"],
    ["null", null],
    ["an array", []],
  ])("rejects %s", (_name, message) => {
    expect(authRequestSchema.safeParse(message).success).toBe(false);
  });
});

describe("authStateSchema", () => {
  it("accepts signed-out and signed-in states", () => {
    expect(authStateSchema.safeParse({ status: "signedOut" }).success).toBe(true);
    expect(authStateSchema.safeParse(SIGNED_IN).success).toBe(true);
  });

  it("accepts a signed-in user without an email", () => {
    expect(
      authStateSchema.safeParse({
        status: "signedIn",
        user: { id: "u", email: null, displayName: "Guest", isAnonymous: true },
      }).success,
    ).toBe(true);
  });

  it("rejects a signed-in state without a user", () => {
    expect(authStateSchema.safeParse({ status: "signedIn" }).success).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(authStateSchema.safeParse({ status: "pending" }).success).toBe(false);
  });
});

describe("authStateChangedSchema", () => {
  it("accepts a broadcast carrying a state", () => {
    expect(
      authStateChangedSchema.safeParse({ type: "auth.stateChanged", state: SIGNED_IN }).success,
    ).toBe(true);
  });

  it("rejects a broadcast without a valid state", () => {
    expect(
      authStateChangedSchema.safeParse({ type: "auth.stateChanged", state: { status: "x" } })
        .success,
    ).toBe(false);
  });
});

describe("responses", () => {
  it("builds a fixed message for every error code", () => {
    for (const code of AUTH_ERROR_CODES) {
      expect(failure(code)).toEqual({
        ok: false,
        error: { code, message: AUTH_ERROR_MESSAGES[code] },
      });
      expect(AUTH_ERROR_MESSAGES[code]).not.toBe("");
    }
  });

  it("validates a success response against the schema of its request", () => {
    expect(AUTH_RESPONSE_SCHEMAS["auth.getState"].safeParse(success(SIGNED_IN)).success).toBe(true);
    expect(AUTH_RESPONSE_SCHEMAS["auth.sendCode"].safeParse(success(null)).success).toBe(true);
    expect(AUTH_RESPONSE_SCHEMAS["auth.sendCode"].safeParse(success(SIGNED_IN)).success).toBe(
      false,
    );
  });

  it("accepts an error response for every request type", () => {
    for (const schema of Object.values(AUTH_RESPONSE_SCHEMAS)) {
      expect(schema.safeParse(failure("rate_limited")).success).toBe(true);
    }
  });

  it("rejects an error response with a code outside the whitelist", () => {
    expect(
      AUTH_RESPONSE_SCHEMAS["auth.signOut"].safeParse({
        ok: false,
        error: { code: "database_exploded", message: "x" },
      }).success,
    ).toBe(false);
  });

  it("rejects values that are not responses", () => {
    expect(AUTH_RESPONSE_SCHEMAS["auth.getState"].safeParse(undefined).success).toBe(false);
    expect(AUTH_RESPONSE_SCHEMAS["auth.getState"].safeParse({ ok: true }).success).toBe(false);
  });
});
