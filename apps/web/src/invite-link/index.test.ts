import { describe, expect, it } from "vitest";

import { inviteLink, invitePath, inviteSignInPath, isInviteToken, workspaceInvitesPath } from ".";

const TOKEN = "a".repeat(48);

describe("isInviteToken", () => {
  it.each([TOKEN, "abc-DEF_123", "x"])("accepts %s", (value) => {
    expect(isInviteToken(value)).toBe(true);
  });

  it.each(["", "a b", "a/b", "a?b", "../x", "a".repeat(129), "tok\nen", "%20", "é"])(
    "rejects %j",
    (value) => {
      expect(isInviteToken(value)).toBe(false);
    },
  );
});

describe("paths", () => {
  it("builds the invite path and the full link", () => {
    expect(invitePath(TOKEN)).toBe(`/invite/${TOKEN}`);
    expect(inviteLink("https://app.sitenote.test", TOKEN)).toBe(
      `https://app.sitenote.test/invite/${TOKEN}`,
    );
  });

  it("returns to the invite after sign-in through an encoded next parameter", () => {
    expect(inviteSignInPath(TOKEN)).toBe(`/sign-in?next=%2Finvite%2F${TOKEN}`);
  });

  it("builds the invites page path of a workspace", () => {
    expect(workspaceInvitesPath("w-1")).toBe("/app/w/w-1/invites");
  });
});
