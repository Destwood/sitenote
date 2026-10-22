import { describe, expect, it } from "vitest";

import { inviteStatus } from ".";

const NOW = Date.parse("2026-10-22T12:00:00Z");

describe("inviteStatus", () => {
  it("is active before the expiry", () => {
    expect(inviteStatus({ expires_at: "2026-10-22T12:00:01Z", revoked_at: null }, NOW)).toBe(
      "active",
    );
  });

  it("is expired at and after the expiry", () => {
    expect(inviteStatus({ expires_at: "2026-10-22T12:00:00Z", revoked_at: null }, NOW)).toBe(
      "expired",
    );
    expect(inviteStatus({ expires_at: "2026-10-01T00:00:00Z", revoked_at: null }, NOW)).toBe(
      "expired",
    );
  });

  it("is revoked even when the expiry is in the future", () => {
    expect(
      inviteStatus({ expires_at: "2026-11-01T00:00:00Z", revoked_at: "2026-10-22T11:00:00Z" }, NOW),
    ).toBe("revoked");
  });

  it("is revoked when it has also expired", () => {
    expect(
      inviteStatus({ expires_at: "2026-10-01T00:00:00Z", revoked_at: "2026-09-30T00:00:00Z" }, NOW),
    ).toBe("revoked");
  });
});
