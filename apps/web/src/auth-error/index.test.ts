import { describe, expect, it } from "vitest";

import {
  describeCallbackError,
  describeOAuthError,
  describeSendCodeError,
  describeVerifyCodeError,
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
    expect(describeCallbackError("exchange_failed")).toContain("could not complete");
  });
});

describe("code errors", () => {
  it("explains rate limits by status and by code", () => {
    expect(describeSendCodeError({ status: 429 })).toContain("Too many attempts");
    expect(describeSendCodeError({ code: "over_email_send_rate_limit" })).toContain(
      "Too many attempts",
    );
    expect(describeVerifyCodeError({ status: 429 })).toContain("Too many attempts");
    expect(describeOAuthError({ code: "over_request_rate_limit" })).toContain("Too many attempts");
  });

  it("explains an invalid address", () => {
    expect(describeSendCodeError({ code: "email_address_invalid" })).toBe(
      "Enter a valid email address.",
    );
  });

  it("explains a wrong or expired code", () => {
    expect(describeVerifyCodeError({ code: "otp_expired", status: 403 })).toContain(
      "wrong or has expired",
    );
  });

  it("falls back to a connection hint without leaking raw messages", () => {
    expect(describeSendCodeError({ status: 500 })).toContain("could not send");
    expect(describeVerifyCodeError({})).toContain("could not verify");
    expect(describeOAuthError({ status: 400 })).toContain("Google sign-in");
  });
});
