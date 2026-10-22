import { describe, expect, it } from "vitest";

import { toOpenableOrigin } from ".";

describe("toOpenableOrigin", () => {
  it.each([
    ["http://127.0.0.1:4173", "http://127.0.0.1:4173"],
    ["https://example.com", "https://example.com"],
    ["https://example.com/path?x=1", "https://example.com"],
  ])("opens %s as %s", (input, expected) => {
    expect(toOpenableOrigin(input)).toBe(expected);
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "ftp://example.com", "nonsense", ""])(
    "refuses %j",
    (input) => {
      expect(toOpenableOrigin(input)).toBeNull();
    },
  );
});
