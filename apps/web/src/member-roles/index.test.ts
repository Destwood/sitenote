import { describe, expect, it } from "vitest";

import { MEMBER_ROLE_LABELS, parseAssignableRole } from ".";

describe("parseAssignableRole", () => {
  it("accepts member and guest only", () => {
    expect(parseAssignableRole("member")).toBe("member");
    expect(parseAssignableRole("guest")).toBe("guest");
    expect(parseAssignableRole("owner")).toBeNull();
    expect(parseAssignableRole(undefined)).toBeNull();
  });
});

describe("MEMBER_ROLE_LABELS", () => {
  it("names every role", () => {
    expect(MEMBER_ROLE_LABELS).toEqual({ owner: "Owner", member: "Member", guest: "Guest" });
  });
});
