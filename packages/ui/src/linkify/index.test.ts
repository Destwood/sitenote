import { describe, expect, it } from "vitest";

import { splitLinks } from ".";

describe("splitLinks", () => {
  it("returns plain text without links as one text segment", () => {
    expect(splitLinks("no links here")).toEqual([{ kind: "text", text: "no links here" }]);
  });

  it("splits one link out of the middle of the text", () => {
    expect(splitLinks("see https://a.com/x now")).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", text: "https://a.com/x", href: "https://a.com/x" },
      { kind: "text", text: " now" },
    ]);
  });

  it("keeps a trailing period and comma outside the link", () => {
    expect(splitLinks("see https://a.com/x.")).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", text: "https://a.com/x", href: "https://a.com/x" },
      { kind: "text", text: "." },
    ]);
    expect(splitLinks("https://a.com/x, then")).toEqual([
      { kind: "link", text: "https://a.com/x", href: "https://a.com/x" },
      { kind: "text", text: ", then" },
    ]);
  });

  it("splits two links with the text between them", () => {
    expect(splitLinks("a https://a.com and https://b.com")).toEqual([
      { kind: "text", text: "a " },
      { kind: "link", text: "https://a.com", href: "https://a.com" },
      { kind: "text", text: " and " },
      { kind: "link", text: "https://b.com", href: "https://b.com" },
    ]);
  });

  it("leaves the closing parenthesis of a parenthesised link outside", () => {
    expect(splitLinks("(see https://a.com/x)")).toEqual([
      { kind: "text", text: "(see " },
      { kind: "link", text: "https://a.com/x", href: "https://a.com/x" },
      { kind: "text", text: ")" },
    ]);
  });

  it("keeps a balanced parenthesis inside the link", () => {
    expect(splitLinks("https://en.wikipedia.org/wiki/Foo_(bar)")).toEqual([
      {
        kind: "link",
        text: "https://en.wikipedia.org/wiki/Foo_(bar)",
        href: "https://en.wikipedia.org/wiki/Foo_(bar)",
      },
    ]);
  });

  it("keeps Jira and ClickUp URLs whole", () => {
    expect(splitLinks("https://acme.atlassian.net/browse/AB-123")).toEqual([
      {
        kind: "link",
        text: "https://acme.atlassian.net/browse/AB-123",
        href: "https://acme.atlassian.net/browse/AB-123",
      },
    ]);
    expect(splitLinks("https://app.clickup.com/t/86abc")).toEqual([
      {
        kind: "link",
        text: "https://app.clickup.com/t/86abc",
        href: "https://app.clickup.com/t/86abc",
      },
    ]);
  });

  it("does not link javascript: URLs", () => {
    expect(splitLinks("javascript:alert(1)")).toEqual([
      { kind: "text", text: "javascript:alert(1)" },
    ]);
  });

  it("returns no segments for an empty string", () => {
    expect(splitLinks("")).toEqual([]);
  });
});
