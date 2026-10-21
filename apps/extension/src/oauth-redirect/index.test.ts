import { describe, expect, it } from "vitest";

import { parseOAuthRedirect } from ".";

const REDIRECT = "https://anefihllkbkenhjbjggfndgemgkfaeoa.chromiumapp.org/";

describe("parseOAuthRedirect", () => {
  it("reads the code from the query", () => {
    expect(parseOAuthRedirect(`${REDIRECT}?code=abc-123`, REDIRECT)).toEqual({
      kind: "code",
      code: "abc-123",
    });
  });

  it("reads the code when the redirect carries a path", () => {
    expect(parseOAuthRedirect(`${REDIRECT}callback?code=abc`, REDIRECT)).toEqual({
      kind: "code",
      code: "abc",
    });
  });

  it("reads the code from the fragment", () => {
    expect(parseOAuthRedirect(`${REDIRECT}#code=abc`, REDIRECT)).toEqual({
      kind: "code",
      code: "abc",
    });
  });

  it("maps access_denied to a cancellation", () => {
    expect(
      parseOAuthRedirect(`${REDIRECT}?error=access_denied&error_description=No`, REDIRECT),
    ).toEqual({ kind: "denied" });
  });

  it("maps any other provider error to an error without echoing it", () => {
    expect(
      parseOAuthRedirect(`${REDIRECT}?error=server_error&error_description=boom`, REDIRECT),
    ).toEqual({ kind: "error" });
  });

  it("reads an error from the fragment", () => {
    expect(parseOAuthRedirect(`${REDIRECT}#error=access_denied`, REDIRECT)).toEqual({
      kind: "denied",
    });
  });

  it("prefers the error over a code", () => {
    expect(parseOAuthRedirect(`${REDIRECT}?code=abc&error=server_error`, REDIRECT)).toEqual({
      kind: "error",
    });
  });

  it("reports a redirect without a code or an error as missing", () => {
    expect(parseOAuthRedirect(REDIRECT, REDIRECT)).toEqual({ kind: "missing" });
    expect(parseOAuthRedirect(`${REDIRECT}?code=`, REDIRECT)).toEqual({ kind: "missing" });
  });

  it("reports an unparsable URL as missing", () => {
    expect(parseOAuthRedirect("not a url", REDIRECT)).toEqual({ kind: "missing" });
    expect(parseOAuthRedirect(`${REDIRECT}?code=abc`, "not a url")).toEqual({ kind: "missing" });
  });

  it("rejects a redirect from another origin", () => {
    expect(parseOAuthRedirect("https://evil.example/?code=abc", REDIRECT)).toEqual({
      kind: "missing",
    });
  });
});
