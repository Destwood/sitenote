import { afterEach, describe, expect, it, vi } from "vitest";

import { FORGET_SESSION_PATH, forgetWebSession } from ".";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("forgetWebSession", () => {
  it("posts to the same-origin endpoint and reports success", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetchMock);

    expect(await forgetWebSession()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(FORGET_SESSION_PATH, {
      method: "POST",
      credentials: "same-origin",
    });
  });

  it("reports a refused request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 403 }))),
    );

    expect(await forgetWebSession()).toBe(false);
  });

  it("reports a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("offline"))),
    );

    expect(await forgetWebSession()).toBe(false);
  });
});
