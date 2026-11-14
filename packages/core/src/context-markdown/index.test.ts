import { describe, expect, it } from "vitest";

import type { Anchor } from "../anchoring";
import type { ConsoleErrorRecord, NetworkErrorRecord, ThreadContext } from "../context";
import { CONTEXT_MARKDOWN_MAX, formatThreadContextMarkdown } from ".";

const AT = "2026-10-22T09:30:00.000Z";
const PAGE = "https://example.com/pricing";

function context(overrides: Partial<ThreadContext> = {}): ThreadContext {
  return {
    viewport: { width: 1440, height: 900 },
    devicePixelRatio: 2,
    pageTitle: "Pricing",
    url: "https://example.com/pricing?plan=pro",
    browser: { name: "Chrome", version: "130" },
    os: { name: "macOS", version: "14.5" },
    userAgent: "Mozilla/5.0",
    consoleErrors: [],
    capturedAt: AT,
    ...overrides,
  };
}

const ELEMENT: Anchor = {
  kind: "element",
  selectors: { css: "#buy", nthPath: "div > button" },
  fingerprint: { tag: "button", text: "Buy now", classes: [], width: 80, height: 32 },
  offset: { x: 0.5, y: 0.5 },
};

function consoleError(
  index: number,
  overrides: Partial<ConsoleErrorRecord> = {},
): ConsoleErrorRecord {
  return { kind: "error", message: `Boom ${String(index)}`, at: AT, ...overrides };
}

function networkError(
  index: number,
  overrides: Partial<NetworkErrorRecord> = {},
): NetworkErrorRecord {
  return {
    kind: "fetch",
    method: "GET",
    url: `https://api.example.com/${String(index)}`,
    status: 500,
    at: AT,
    ...overrides,
  };
}

describe("formatThreadContextMarkdown", () => {
  it("writes every section in order with the thread header", () => {
    const markdown = formatThreadContextMarkdown({
      excerpt: "Checkout button does nothing\nsecond line",
      authorName: "Olena",
      status: "open",
      threadUrl: "https://app.example.com/t/1",
      pageUrl: PAGE,
      context: context({
        consoleErrors: [consoleError(1, { stack: "Error: Boom\n    at buy.js:1" })],
        networkErrors: [networkError(1, { status: 0, statusText: "" })],
        recording: {
          path: "rec/1.webm",
          durationMs: 5000,
          size: 10,
          startUrl: "https://example.com/start",
          startsSignedOut: true,
          steps: [
            { t: 0, kind: "click", selector: "#buy", label: "Buy now" },
            { t: 1, kind: "input", selector: "#email", label: "Email", sensitive: true },
            { t: 2, kind: "navigate", selector: "body", label: "Cart", url: "/cart" },
          ],
        },
      }),
      anchor: ELEMENT,
    });

    expect(markdown).toBe(
      [
        "## Bug report",
        "**Checkout button does nothing**",
        "Status: open · Author: Olena",
        "Thread: https://app.example.com/t/1",
        "",
        "### Page",
        "URL: https://example.com/pricing?plan=pro",
        "Title: Pricing",
        `Captured: ${AT}`,
        "",
        "### Environment",
        "Browser: Chrome 130",
        "OS: macOS 14.5",
        "Viewport: 1440x900 @ 2x",
        "",
        "### Element",
        "Selector: `#buy`",
        "Text: Buy now",
        "",
        "### Steps to reproduce",
        '1. click "Buy now" (`#buy`)',
        '2. Type into "Email" (value not recorded)',
        "",
        "Starts signed out: yes",
        "Recording started at: https://example.com/start",
        "",
        "### Failed network requests",
        "| Time | Method | URL | Status |",
        "| --- | --- | --- | --- |",
        "| 09:30:00 UTC | GET | https://api.example.com/1 | failed |",
        "",
        "### Console errors",
        "- [09:30:00 UTC] error: Boom 1",
        "  ```",
        "  Error: Boom",
        "      at buy.js:1",
        "  ```",
      ].join("\n"),
    );
  });

  it("omits sections without data and falls back to the page url", () => {
    const markdown = formatThreadContextMarkdown({
      excerpt: "Typo",
      pageUrl: PAGE,
      context: null,
      anchor: null,
    });

    expect(markdown).toBe(["## Bug report", "**Typo**", "", "### Page", `URL: ${PAGE}`].join("\n"));
  });

  it("uses the text quote for a text anchor and skips the element section without one", () => {
    const markdown = formatThreadContextMarkdown({
      excerpt: "x",
      pageUrl: PAGE,
      context: null,
      anchor: {
        kind: "text",
        quote: { exact: "Pay  now", prefix: "", suffix: "" },
        position: { start: 0, end: 8 },
        container: "body",
      },
    });

    expect(markdown).toContain("### Element\nText: Pay now");
    expect(markdown).not.toContain("Selector:");
  });

  it("hides the selector and value of sensitive steps", () => {
    const markdown = formatThreadContextMarkdown({
      excerpt: "x",
      pageUrl: PAGE,
      context: context({
        recording: {
          path: "rec/1.webm",
          durationMs: 1,
          size: 1,
          steps: [
            { t: 0, kind: "click", selector: "#secret", label: "Reveal", sensitive: true },
            {
              t: 1,
              kind: "navigate",
              selector: "body",
              label: "Vault",
              url: "/vault",
              sensitive: true,
            },
          ],
        },
      }),
      anchor: null,
    });

    expect(markdown).toContain('1. click "Reveal"');
    expect(markdown).not.toContain("Vault");
    expect(markdown).not.toContain("#secret");
    expect(markdown).not.toContain("/vault");
  });

  it("clips each stack to 600 characters", () => {
    const stack = "a".repeat(700);
    const markdown = formatThreadContextMarkdown({
      excerpt: "x",
      pageUrl: PAGE,
      context: context({ consoleErrors: [consoleError(1, { stack })] }),
      anchor: null,
    });

    expect(markdown).toContain(`  ${"a".repeat(600)}\n`);
    expect(markdown).not.toContain("a".repeat(601));
  });

  it("drops the oldest console errors first and marks the output as truncated", () => {
    const message = "m".repeat(900);
    const consoleErrors = Array.from({ length: 20 }, (_, index) =>
      consoleError(index, { message: `${String(index)}-${message}`, stack: "s".repeat(600) }),
    );
    const markdown = formatThreadContextMarkdown({
      excerpt: "x",
      pageUrl: PAGE,
      context: context({ consoleErrors }),
      anchor: null,
    });

    expect(markdown.length).toBeLessThanOrEqual(CONTEXT_MARKDOWN_MAX);
    expect(markdown.endsWith("…truncated")).toBe(true);
    expect(markdown).not.toContain("error: 0-");
    expect(markdown).toContain("error: 19-");
  });

  it("keeps the output under the cap even when the header alone is too long", () => {
    const markdown = formatThreadContextMarkdown({
      excerpt: "x".repeat(20000),
      pageUrl: PAGE,
      context: null,
      anchor: null,
    });

    expect(markdown.length).toBe(CONTEXT_MARKDOWN_MAX);
    expect(markdown.endsWith("…truncated")).toBe(true);
  });
});
