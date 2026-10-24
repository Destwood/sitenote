import { describe, expect, it } from "vitest";

import { escapeHtml, escapeMarkdown, firstCodePoints, safeHttpUrl, singleLine } from "./index.ts";

describe("escapeHtml", () => {
  it("escapes markup characters and quotes", () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;",
    );
  });
});

describe("escapeMarkdown", () => {
  it("backslash-escapes markdown control characters", () => {
    expect(escapeMarkdown("*bold* _x_ [a](b) `c` <d> #e")).toBe(
      "\\*bold\\* \\_x\\_ \\[a\\](b) \\`c\\` \\<d\\> \\#e",
    );
  });

  it("keeps ordinary text and punctuation", () => {
    expect(escapeMarkdown("Hello, world. 2 + 2 = 4")).toBe("Hello, world. 2 + 2 = 4");
  });
});

describe("singleLine", () => {
  it("collapses whitespace and line breaks", () => {
    expect(singleLine("  first\n\tsecond   third  ")).toBe("first second third");
  });
});

describe("firstCodePoints", () => {
  it("returns short text unchanged", () => {
    expect(firstCodePoints("short", 10)).toBe("short");
  });

  it("cuts by code points and marks the cut", () => {
    expect(firstCodePoints("abcdef", 4)).toBe("abc…");
    expect(firstCodePoints("😀😀😀😀", 3)).toBe("😀😀…");
  });
});

describe("safeHttpUrl", () => {
  it("accepts http and https", () => {
    expect(safeHttpUrl("https://example.com/p?x=1")).toBe("https://example.com/p?x=1");
    expect(safeHttpUrl("http://127.0.0.1:4173/")).toBe("http://127.0.0.1:4173/");
  });

  it("rejects other schemes and malformed values", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
  });
});
