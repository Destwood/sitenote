import { describe, expect, it } from "vitest";

import { DEFAULT_REDIRECT_PATH, safeRedirectPath } from ".";

describe("safeRedirectPath accepts same-origin relative paths", () => {
  it.each([
    ["/app", "/app"],
    ["/", "/"],
    ["/app/settings", "/app/settings"],
    ["/app?tab=members", "/app?tab=members"],
    ["/app#top", "/app#top"],
    ["/a/b/../c", "/a/c"],
    ["/app?next=%2Fapp", "/app?next=%2Fapp"],
    ["/search?q=100%25", "/search?q=100%25"],
    ["/path%20with%20spaces", "/path%20with%20spaces"],
  ])("keeps %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});

describe("safeRedirectPath falls back for everything else", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty string", ""],
    ["array of values", ["/app", "/other"]],
    ["empty array", []],
    ["protocol relative", "//evil.example"],
    ["protocol relative with path", "//evil.example/app"],
    ["triple slash", "///evil.example"],
    ["slash backslash", "/\\evil.example"],
    ["backslash first", "\\evil.example"],
    ["double backslash", "\\\\evil.example"],
    ["backslash later in the path", "/app\\..\\evil"],
    ["absolute https URL", "https://evil.example"],
    ["absolute http URL", "http://evil.example/app"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>alert(1)</script>"],
    ["mixed case scheme", "JaVaScRiPt:alert(1)"],
    ["no leading slash", "app"],
    ["relative dot segment", "../app"],
    ["host without scheme", "evil.example/app"],
    ["leading space", " /app"],
    ["leading space protocol relative", " //evil.example"],
    ["leading tab before slashes", "\t//evil.example"],
    ["tab between slashes", "/\t/evil.example"],
    ["newline between slashes", "/\n/evil.example"],
    ["carriage return between slashes", "/\r/evil.example"],
    ["null byte", "/app\u0000"],
    ["line separator", "/app "],
    ["encoded double slash", "%2F%2Fevil.example"],
    ["slash then encoded slash", "/%2Fevil.example"],
    ["slash then encoded backslash", "/%5Cevil.example"],
    ["encoded backslash anywhere", "/app%5C..%5Cevil"],
    ["lowercase encoded slash", "/%2fevil.example"],
    ["double encoded slash", "/%252Fevil.example"],
    ["double encoded backslash", "/%255Cevil.example"],
    ["triple encoded slash", "/%25252Fevil.example"],
    ["encoded newline", "/%0a/evil.example"],
    ["encoded tab", "/%09/evil.example"],
    ["encoded carriage return", "/%0d/evil.example"],
    ["encoded null byte", "/app%00"],
    ["dot segments climbing to protocol relative", "/.//evil.example"],
    ["path that normalises to protocol relative", "/a/..//evil.example"],
    ["very long path", `/${"a".repeat(3000)}`],
  ])("rejects %s", (_name, input) => {
    expect(safeRedirectPath(input)).toBe(DEFAULT_REDIRECT_PATH);
  });

  it("uses the supplied fallback", () => {
    expect(safeRedirectPath("//evil.example", "/home")).toBe("/home");
    expect(safeRedirectPath(undefined, "/home")).toBe("/home");
  });
});
