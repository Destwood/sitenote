import type { SitenoteClient } from "@sitenote/db";
import { describe, expect, it, vi } from "vitest";

import { readRecordingState, RECORDING_BUCKET, RECORDING_URL_SECONDS } from ".";

const PATH = "10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.webm";

function clientReturning(result: unknown) {
  const createSignedUrl = vi.fn(() => Promise.resolve(result));
  const from = vi.fn(() => ({ createSignedUrl }));
  return {
    client: { storage: { from } } as unknown as SitenoteClient,
    from,
    createSignedUrl,
  };
}

describe("readRecordingState", () => {
  it("signs a link to the stored recording for one hour", async () => {
    const { client, from, createSignedUrl } = clientReturning({
      data: { signedUrl: "https://storage.example.test/signed" },
      error: null,
    });

    await expect(readRecordingState(client, PATH)).resolves.toEqual({
      status: "ready",
      url: "https://storage.example.test/signed",
    });
    expect(from).toHaveBeenCalledWith(RECORDING_BUCKET);
    expect(createSignedUrl).toHaveBeenCalledWith(PATH, RECORDING_URL_SECONDS);
    expect(RECORDING_URL_SECONDS).toBe(3600);
  });

  it("reports the recording unavailable when signing fails", async () => {
    const { client } = clientReturning({ data: null, error: { message: "denied" } });

    await expect(readRecordingState(client, PATH)).resolves.toEqual({ status: "unavailable" });
  });
});
