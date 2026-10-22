import { describe, expect, it } from "vitest";

import { parseExpiryDays, parseInviteRole, toInterval } from ".";

describe("parseInviteRole", () => {
  it.each(["member", "guest"])("accepts %s", (role) => {
    expect(parseInviteRole(role)).toBe(role);
  });

  it.each(["owner", "", "Guest", null, undefined, 1])("rejects %j", (value) => {
    expect(parseInviteRole(value)).toBeNull();
  });
});

describe("parseExpiryDays", () => {
  it.each([
    ["1", 1],
    ["7", 7],
    ["30", 30],
  ])("accepts %s", (value, days) => {
    expect(parseExpiryDays(value)).toBe(days);
  });

  it.each(["0", "2", "31", "365", "7.5", "", "abc", " 7", null, 7, undefined])(
    "rejects %j",
    (value) => {
      expect(parseExpiryDays(value)).toBeNull();
    },
  );
});

describe("toInterval", () => {
  it("formats days as a Postgres interval", () => {
    expect(toInterval(7)).toBe("7 days");
  });
});
