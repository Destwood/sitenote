import { describe, expect, it } from "vitest";

import { abbreviateRoute, parsePageUrl } from ".";

describe("parsePageUrl", () => {
  it.each([
    ["https://example.com", "https://example.com", "https://example.com"],
    ["https://example.com/", "https://example.com", "https://example.com"],
    ["https://example.com///", "https://example.com", "https://example.com"],
    ["https://example.com/pricing", "https://example.com", "https://example.com/pricing"],
    ["https://example.com/pricing/", "https://example.com", "https://example.com/pricing"],
    ["https://example.com/a/b//", "https://example.com", "https://example.com/a/b"],
    ["HTTPS://Example.COM/Pricing", "https://example.com", "https://example.com/Pricing"],
    ["https://example.com:443/pricing", "https://example.com", "https://example.com/pricing"],
    ["http://example.com:80/pricing", "http://example.com", "http://example.com/pricing"],
    ["http://localhost:3000/docs/", "http://localhost:3000", "http://localhost:3000/docs"],
    ["http://127.0.0.1:4173/", "http://127.0.0.1:4173", "http://127.0.0.1:4173"],
    ["https://example.com:8443/x", "https://example.com:8443", "https://example.com:8443/x"],
    ["https://example.com/index.html", "https://example.com", "https://example.com/index.html"],
    [
      "https://example.com/docs/index.html/",
      "https://example.com",
      "https://example.com/docs/index.html",
    ],
    ["https://example.com/a%20b/", "https://example.com", "https://example.com/a%20b"],
    ["https://example.com/caf%C3%A9", "https://example.com", "https://example.com/caf%C3%A9"],
    ["https://example.com/café", "https://example.com", "https://example.com/caf%C3%A9"],
    ["https://example.com/a b", "https://example.com", "https://example.com/a%20b"],
    ["https://example.com/p?x=1&y=2", "https://example.com", "https://example.com/p"],
    ["https://example.com/p/?x=1", "https://example.com", "https://example.com/p"],
    ["https://example.com/p#section", "https://example.com", "https://example.com/p"],
    ["https://example.com/#top", "https://example.com", "https://example.com"],
    ["https://example.com/p/?q=1#hash", "https://example.com", "https://example.com/p"],
    ["https://user:pass@example.com/p", "https://example.com", "https://example.com/p"],
    ["https://sub.example.com/p", "https://sub.example.com", "https://sub.example.com/p"],
    ["https://example.com/a/../b", "https://example.com", "https://example.com/b"],
  ])("normalizes %s", (input, site, page) => {
    expect(parsePageUrl(input)).toEqual({ site, page });
  });

  it("treats the same page with different queries and hashes as one page", () => {
    const first = parsePageUrl("https://example.com/p/?a=1#x");
    const second = parsePageUrl("https://example.com/p?b=2#y");
    expect(first).toEqual(second);
  });

  it.each([
    "ftp://example.com/file",
    "file:///C:/index.html",
    "chrome://extensions",
    "chrome-extension://abcdef/popup.html",
    "about:blank",
    "javascript:alert(1)",
    "data:text/html,<p>x</p>",
    "mailto:a@example.com",
    "ws://example.com/socket",
    "not a url",
    "/relative/path",
    "example.com/path",
    "",
  ])("returns null for %j", (input) => {
    expect(parsePageUrl(input)).toBeNull();
  });
});

describe("abbreviateRoute", () => {
  it("abbreviates a UUID after a static segment into a named placeholder", () => {
    expect(abbreviateRoute("/template/3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toEqual([
      { text: "template", full: "template", dynamic: false },
      {
        text: "{templateId}",
        full: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        dynamic: true,
      },
    ]);
  });

  it("uses a generic placeholder for a number without a named predecessor", () => {
    expect(abbreviateRoute("/12345")).toEqual([{ text: "{id}", full: "12345", dynamic: true }]);
  });

  it("keeps a static route as is", () => {
    expect(abbreviateRoute("/user-profiles/settings")).toEqual([
      { text: "user-profiles", full: "user-profiles", dynamic: false },
      { text: "settings", full: "settings", dynamic: false },
    ]);
  });

  it("returns no segments for the root", () => {
    expect(abbreviateRoute("/")).toEqual([]);
    expect(abbreviateRoute("")).toEqual([]);
  });
});
