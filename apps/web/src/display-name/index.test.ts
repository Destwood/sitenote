import { describe, expect, it } from "vitest";

import { parseDisplayName } from ".";

describe("parseDisplayName", () => {
  it("trims the name", () => {
    expect(parseDisplayName("  Gina Client ")).toBe("Gina Client");
  });

  it("accepts 80 characters and rejects 81", () => {
    expect(parseDisplayName("a".repeat(80))).toBe("a".repeat(80));
    expect(parseDisplayName("a".repeat(81))).toBeNull();
  });

  it.each(["", "   ", null, undefined, 5])("rejects %j", (value) => {
    expect(parseDisplayName(value)).toBeNull();
  });
});
