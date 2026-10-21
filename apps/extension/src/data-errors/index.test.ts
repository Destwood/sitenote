import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { mapDataError } from ".";

describe("mapDataError", () => {
  it.each([
    [
      "an RLS violation",
      { code: "42501", message: "new row violates row-level security" },
      "forbidden",
    ],
    ["a forbidden status", { status: 403, message: "nope" }, "forbidden"],
    ["an expired token", { code: "PGRST301", message: "JWT expired" }, "unauthorized"],
    ["an invalid token", { code: "PGRST303", message: "JWT invalid" }, "unauthorized"],
    ["an unauthorized status", { status: 401, message: "no" }, "unauthorized"],
    ["no row for single()", { code: "PGRST116", message: "0 rows" }, "not_found"],
    ["a missing resource status", { status: 404, message: "gone" }, "not_found"],
    ["a check violation", { code: "23514", message: "check" }, "validation"],
    ["a unique violation", { code: "23505", message: "dup" }, "validation"],
    ["a null violation", { code: "23502", message: "null" }, "validation"],
    ["an invalid text representation", { code: "22P02", message: "uuid" }, "validation"],
    ["a rate limit status", { status: 429, message: "slow down" }, "rate_limited"],
    [
      "a failed fetch reported as an error object",
      { code: "", message: "TypeError: Failed to fetch" },
      "network",
    ],
    [
      "a fetch error without a code",
      { message: "NetworkError when attempting to fetch" },
      "network",
    ],
    ["a thrown TypeError", new TypeError("fetch failed"), "network"],
    ["an auth retryable fetch error", new AuthRetryableFetchError("offline", 0), "network"],
    ["another auth error", new AuthApiError("bad", 400, "bad_request"), "unknown"],
    ["an unknown database code", { code: "XX000", message: "boom" }, "unknown"],
    ["a plain object", {}, "unknown"],
    ["null", null, "unknown"],
    ["a string", "boom", "unknown"],
  ])("maps %s to the matching code", (_name, error, expected) => {
    expect(mapDataError(error)).toBe(expected);
  });

  it("never lets a database message through", () => {
    expect(mapDataError({ code: "XX000", message: "secret table name leaked" })).toBe("unknown");
  });
});
