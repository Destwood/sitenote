import { describe, expect, it } from "vitest";

import { formatAbsoluteTime, formatRelativeTime } from ".";

const NOW = Date.parse("2026-10-21T12:00:00.000Z");

function ago(seconds: number): string {
  return new Date(NOW - seconds * 1000).toISOString();
}

describe("formatRelativeTime", () => {
  it.each([
    [5, "now"],
    [59, "now"],
    [60, "1 minute ago"],
    [5 * 60, "5 minutes ago"],
    [59 * 60, "59 minutes ago"],
    [60 * 60, "1 hour ago"],
    [23 * 3600, "23 hours ago"],
    [24 * 3600, "yesterday"],
    [3 * 24 * 3600, "3 days ago"],
    [45 * 24 * 3600, "last month"],
    [200 * 24 * 3600, "6 months ago"],
    [400 * 24 * 3600, "last year"],
    [800 * 24 * 3600, "2 years ago"],
  ])("formats %i seconds in the past", (seconds, expected) => {
    expect(formatRelativeTime(ago(seconds), NOW, "en")).toBe(expected);
  });

  it("formats a timestamp in the future", () => {
    expect(formatRelativeTime(ago(-2 * 3600), NOW, "en")).toBe("in 2 hours");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatRelativeTime("not a date", NOW, "en")).toBe("");
  });
});

describe("formatAbsoluteTime", () => {
  it("formats a valid timestamp and ignores an invalid one", () => {
    expect(formatAbsoluteTime("2026-10-21T12:00:00.000Z", "en")).toContain("2026");
    expect(formatAbsoluteTime("nope", "en")).toBe("");
  });
});
