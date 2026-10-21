import { describe, expect, it } from "vitest";

import { planRefresh, REFRESH_MARGIN_MS, RETRY_DELAY_MS } from ".";

const NOW = 1_800_000_000_000;

describe("planRefresh", () => {
  it("clears the alarm when nobody is signed in", () => {
    expect(planRefresh({ status: "signedOut" }, NOW)).toBeNull();
  });

  it("schedules the refresh one margin before the access token expires", () => {
    const expiresAt = NOW / 1000 + 3600;

    expect(planRefresh({ status: "active", expiresAt }, NOW)).toBe(
      expiresAt * 1000 - REFRESH_MARGIN_MS,
    );
  });

  it("never schedules sooner than the retry delay for a token that is about to expire", () => {
    expect(planRefresh({ status: "active", expiresAt: NOW / 1000 + 10 }, NOW)).toBe(
      NOW + RETRY_DELAY_MS,
    );
  });

  it("never schedules in the past for a token that already expired", () => {
    expect(planRefresh({ status: "active", expiresAt: NOW / 1000 - 500 }, NOW)).toBe(
      NOW + RETRY_DELAY_MS,
    );
  });

  it("retries after the retry delay when the refresh could not reach the server", () => {
    expect(planRefresh({ status: "retry" }, NOW)).toBe(NOW + RETRY_DELAY_MS);
  });

  it("polls at the retry delay when the session has no expiry", () => {
    expect(planRefresh({ status: "active", expiresAt: undefined }, NOW)).toBe(NOW + RETRY_DELAY_MS);
  });
});
