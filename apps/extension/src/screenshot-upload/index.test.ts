import type { SitenoteClient } from "@sitenote/db";
import { describe, expect, it, vi } from "vitest";

import { createCaptureStore } from "../capture-store";
import { createScreenshotUploader, extensionOf } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";

interface UploadResult {
  error: unknown;
}

function setup(
  options: {
    uploads?: (UploadResult | Error)[];
    type?: string;
    consumeFailure?: () => boolean;
  } = {},
) {
  const queue = [...(options.uploads ?? [])];
  const upload = vi.fn<(path: string, body: Blob, init: unknown) => Promise<UploadResult>>(() => {
    const next = queue.shift() ?? { error: null };
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const from = vi.fn<(bucket: string) => { upload: typeof upload }>(() => ({ upload }));
  const client = { storage: { from } } as unknown as Pick<SitenoteClient, "storage">;
  const store = createCaptureStore({ newId: () => "capture-1" });
  const captureId = store.add({
    blob: new Blob(["x"], { type: options.type ?? "image/webp" }),
    width: 4,
    height: 3,
  });
  const uploader = createScreenshotUploader({
    client,
    store,
    newId: () => THREAD_ID,
    ...(options.consumeFailure === undefined ? {} : { consumeFailure: options.consumeFailure }),
  });
  return { uploader, upload, from, store, captureId };
}

describe("extensionOf", () => {
  it("maps png and everything else to webp", () => {
    expect(extensionOf("image/png")).toBe("png");
    expect(extensionOf("image/webp")).toBe("webp");
    expect(extensionOf("text/plain")).toBe("webp");
  });
});

describe("createScreenshotUploader", () => {
  it("uploads the blob under the workspace folder without upsert and returns the path", async () => {
    const { uploader, upload, from, captureId, store } = setup();

    const attachment = await uploader.attach(captureId, WORKSPACE_ID);

    expect(attachment).toEqual({ threadId: THREAD_ID, path: `${WORKSPACE_ID}/${THREAD_ID}.webp` });
    expect(from).toHaveBeenCalledWith("screenshots");
    expect(upload).toHaveBeenCalledWith(
      `${WORKSPACE_ID}/${THREAD_ID}.webp`,
      store.get(captureId)?.blob,
      { contentType: "image/webp", upsert: false },
    );
  });

  it("uses the png extension for a png blob", async () => {
    const { uploader, captureId } = setup({ type: "image/png" });

    expect(await uploader.attach(captureId, WORKSPACE_ID)).toEqual({
      threadId: THREAD_ID,
      path: `${WORKSPACE_ID}/${THREAD_ID}.png`,
    });
  });

  it("answers null for an unknown or expired capture without uploading", async () => {
    const { uploader, upload } = setup();

    expect(await uploader.attach("missing", WORKSPACE_ID)).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it("keeps the same thread id and skips a second upload after a success", async () => {
    const { uploader, upload, captureId } = setup();

    const first = await uploader.attach(captureId, WORKSPACE_ID);
    const second = await uploader.attach(captureId, WORKSPACE_ID);

    expect(second).toEqual(first);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("returns the thread id with a null path when the upload fails and retries it next time", async () => {
    const { uploader, upload, captureId } = setup({
      uploads: [{ error: { message: "Internal error", statusCode: "500" } }],
    });

    const failed = await uploader.attach(captureId, WORKSPACE_ID);
    const retried = await uploader.attach(captureId, WORKSPACE_ID);

    expect(failed).toEqual({ threadId: THREAD_ID, path: null });
    expect(retried).toEqual({ threadId: THREAD_ID, path: `${WORKSPACE_ID}/${THREAD_ID}.webp` });
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("treats a rejected upload as a failure", async () => {
    const { uploader, captureId } = setup({ uploads: [new TypeError("Failed to fetch")] });

    expect(await uploader.attach(captureId, WORKSPACE_ID)).toEqual({
      threadId: THREAD_ID,
      path: null,
    });
  });

  it("treats an already existing object as uploaded", async () => {
    for (const error of [
      { message: "Bad", statusCode: "409" },
      { message: "The resource already exists" },
    ]) {
      const { uploader, captureId } = setup({ uploads: [{ error }] });

      expect(await uploader.attach(captureId, WORKSPACE_ID)).toEqual({
        threadId: THREAD_ID,
        path: `${WORKSPACE_ID}/${THREAD_ID}.webp`,
      });
    }
  });

  it("skips the upload once when the failure hook says so", async () => {
    const consumeFailure = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const { uploader, upload, captureId } = setup({ consumeFailure });

    expect(await uploader.attach(captureId, WORKSPACE_ID)).toEqual({
      threadId: THREAD_ID,
      path: null,
    });
    expect(upload).not.toHaveBeenCalled();
    expect((await uploader.attach(captureId, WORKSPACE_ID))?.path).not.toBeNull();
  });

  it("forgets the capture on discard", async () => {
    const { uploader, captureId } = setup();

    uploader.discard(captureId);

    expect(await uploader.attach(captureId, WORKSPACE_ID)).toBeNull();
  });
});
