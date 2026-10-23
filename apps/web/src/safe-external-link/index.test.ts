import { describe, expect, it } from "vitest";

import { safeExternalHref } from ".";

describe("safeExternalHref", () => {
  it.each([
    ["https://example.test/pricing", "https://example.test/pricing"],
    ["http://127.0.0.1:4173/", "http://127.0.0.1:4173/"],
  ])("keeps the web address %s", (value, expected) => {
    expect(safeExternalHref(value)).toBe(expected);
  });

  it.each([
    ["javascript:alert(1)"],
    ["JavaScript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["ftp://example.test/file"],
    ["/relative/path"],
    ["not a url"],
  ])("refuses %s", (value) => {
    expect(safeExternalHref(value)).toBeNull();
  });
});
