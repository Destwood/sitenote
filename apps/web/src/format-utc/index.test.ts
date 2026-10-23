import { describe, expect, it } from "vitest";

import { formatUtcDateTime } from ".";

describe("formatUtcDateTime", () => {
  it("formats the instant in UTC with a UTC suffix", () => {
    expect(formatUtcDateTime("2026-10-22T09:30:00Z")).toBe("22 Oct 2026, 09:30 UTC");
  });
});
