import { describe, expect, it } from "vitest";

import {
  describeCallbackError,
  describeOAuthError,
  describeSendLinkError,
  parseCallbackError,
} from ".";

describe("parseCallbackError", () => {
  it.each(["missing_code", "exchange_failed", "access_denied"])("accepts %s", (key) => {
    expect(parseCallbackError(key)).toBe(key);
  });

  it.each([
    undefined,
    null,
    "",
    "unknown",
    "toString",
    "__proto__",
    "<script>alert(1)</script>",
    ["missing_code"],
  ])("rejects %j", (value) => {
    expect(parseCallbackError(value)).toBeNull();
  });

  it("describes every accepted key with a fixed message", () => {
    expect(describeCallbackError("access_denied")).toBe(
      "Sign-in was cancelled. You can try again.",
    );
    expect(describeCallbackError("missing_code")).toContain("incomplete");
    expect(describeCallbackError("exchange_failed")).toContain("invalid or has expired");
  });
});

describe("link errors", () => {
  it("explains rate limits by status and by code", () => {
    expect(describeSendLinkError({ status: 429 })).toContain("Too many attempts");
    expect(describeSendLinkError({ code: "over_email_send_rate_limit" })).toContain(
      "Too many attempts",
    );
    expect(describeOAuthError({ code: "over_request_rate_limit" })).toContain("Too many attempts");
  });

  it("explains an invalid address", () => {
    expect(describeSendLinkError({ code: "email_address_invalid" })).toBe(
      "Enter a valid email address.",
    );
  });

  it("falls back to a connection hint without leaking raw messages", () => {
    expect(describeSendLinkError({ status: 500 })).toContain("could not send the link");
    expect(describeOAuthError({ status: 400 })).toContain("Google sign-in");
  });
});
