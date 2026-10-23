import { describe, expect, it } from "vitest";

import { summarizeThreadContext } from "./index.ts";

const context = {
  viewport: { width: 1280, height: 720 },
  devicePixelRatio: 2,
  pageTitle: "Home",
  url: "https://example.com/",
  browser: { name: "Chrome", version: "130" },
  os: { name: "Windows", version: "11" },
  userAgent: "Mozilla/5.0",
  consoleErrors: [{ kind: "error", message: "boom", at: "2026-10-23T10:00:00.000Z" }],
  capturedAt: "2026-10-23T10:00:00.000Z",
};

describe("summarizeThreadContext", () => {
  it("summarises the viewport, browser, system and error count", () => {
    expect(summarizeThreadContext(context)).toEqual({
      viewport: "1280 x 720",
      devicePixelRatio: 2,
      browser: "Chrome 130",
      os: "Windows 11",
      errorCount: 1,
    });
  });

  it("omits the system version when the context has none", () => {
    expect(summarizeThreadContext({ ...context, os: { name: "Linux" } })?.os).toBe("Linux");
  });

  it("returns null for an empty or malformed context", () => {
    expect(summarizeThreadContext({})).toBeNull();
    expect(summarizeThreadContext(null)).toBeNull();
    expect(summarizeThreadContext({ ...context, viewport: "wide" })).toBeNull();
  });
});
