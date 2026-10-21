import { beforeEach, describe, expect, it } from "vitest";

import { clearPendingSignIn, PENDING_MAX_AGE_MS, readPendingSignIn, savePendingSignIn } from ".";

const NOW = 1_800_000_000_000;

beforeEach(() => {
  localStorage.clear();
});

describe("pending sign-in", () => {
  it("returns null when nothing was saved", () => {
    expect(readPendingSignIn(NOW)).toBeNull();
  });

  it("reads back what was saved", () => {
    savePendingSignIn({ email: "a@b.test", sentAt: NOW - 5000 });

    expect(readPendingSignIn(NOW)).toEqual({ email: "a@b.test", sentAt: NOW - 5000 });
  });

  it("expires after the code lifetime", () => {
    savePendingSignIn({ email: "a@b.test", sentAt: NOW - PENDING_MAX_AGE_MS - 1 });

    expect(readPendingSignIn(NOW)).toBeNull();
  });

  it("still returns a request made exactly at the code lifetime", () => {
    savePendingSignIn({ email: "a@b.test", sentAt: NOW - PENDING_MAX_AGE_MS });

    expect(readPendingSignIn(NOW)?.email).toBe("a@b.test");
  });

  it("ignores a timestamp from the future", () => {
    savePendingSignIn({ email: "a@b.test", sentAt: NOW + 60_000 });

    expect(readPendingSignIn(NOW)).toBeNull();
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["a wrong shape", JSON.stringify({ email: 1, sentAt: "x" })],
    ["an empty email", JSON.stringify({ email: "", sentAt: NOW })],
  ])("ignores %s", (_name, raw) => {
    localStorage.setItem("sitenote.pending-sign-in", raw);

    expect(readPendingSignIn(NOW)).toBeNull();
  });

  it("forgets the request when cleared", () => {
    savePendingSignIn({ email: "a@b.test", sentAt: NOW });

    clearPendingSignIn();

    expect(readPendingSignIn(NOW)).toBeNull();
  });
});
