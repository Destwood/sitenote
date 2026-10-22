import { describe, expect, it, vi } from "vitest";

import { restrictToTrustedContexts } from ".";

describe("restrictToTrustedContexts", () => {
  it("asks the storage area for trusted contexts only", async () => {
    const setAccessLevel = vi.fn(() => Promise.resolve());

    expect(await restrictToTrustedContexts({ setAccessLevel })).toBe(true);
    expect(setAccessLevel).toHaveBeenCalledExactlyOnceWith({ accessLevel: "TRUSTED_CONTEXTS" });
  });

  it("reports false instead of throwing when the browser refuses", async () => {
    const setAccessLevel = vi.fn(() => Promise.reject(new Error("not supported")));

    expect(await restrictToTrustedContexts({ setAccessLevel })).toBe(false);
  });
});
