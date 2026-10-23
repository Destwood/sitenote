import type { SitenoteClient } from "@sitenote/db";
import { describe, expect, it, vi } from "vitest";

import { readScreenshotState, SCREENSHOT_BUCKET, SCREENSHOT_URL_SECONDS } from ".";

const PATH = "10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.webp";

function clientReturning(result: unknown) {
  const createSignedUrl = vi.fn(() => Promise.resolve(result));
  const from = vi.fn(() => ({ createSignedUrl }));
  return {
    client: { storage: { from } } as unknown as SitenoteClient,
    from,
    createSignedUrl,
  };
}

describe("readScreenshotState", () => {
  it("signs a link to the stored screenshot for one hour", async () => {
    const { client, from, createSignedUrl } = clientReturning({
      data: { signedUrl: "https://storage.example.test/signed" },
      error: null,
    });

    await expect(readScreenshotState(client, PATH)).resolves.toEqual({
      status: "ready",
      url: "https://storage.example.test/signed",
    });
    expect(from).toHaveBeenCalledWith(SCREENSHOT_BUCKET);
    expect(createSignedUrl).toHaveBeenCalledWith(PATH, SCREENSHOT_URL_SECONDS);
    expect(SCREENSHOT_URL_SECONDS).toBe(3600);
  });

  it("reports the screenshot unavailable when signing fails", async () => {
    const { client } = clientReturning({ data: null, error: { message: "denied" } });

    await expect(readScreenshotState(client, PATH)).resolves.toEqual({ status: "unavailable" });
  });
});
