import { describe, expect, it } from "vitest";

import { INVALID_INVITE_MESSAGE, describeInviteError } from ".";

describe("describeInviteError", () => {
  it("maps an invalid token to the invalid invite message", () => {
    expect(describeInviteError("22023")).toBe(INVALID_INVITE_MESSAGE);
    expect(INVALID_INVITE_MESSAGE).toBe("This invite link is invalid or has expired.");
  });

  it("explains that a member invite needs an email sign-in", () => {
    expect(describeInviteError("42501")).toContain("Sign in with your email");
  });

  it("asks for a reload when the session ended", () => {
    expect(describeInviteError("28000")).toContain("Reload the page");
  });

  it.each([undefined, "", "XX000", "PGRST301"])(
    "falls back to a generic message for %j",
    (code) => {
      expect(describeInviteError(code)).toBe("We could not accept the invite. Try again.");
    },
  );
});
