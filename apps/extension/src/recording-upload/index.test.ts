import type { SitenoteClient } from "@sitenote/db";
import { describe, expect, it, vi } from "vitest";

import { RECORDING_MAX_BYTES } from "../recording-store";
import {
  createRecordingUploader,
  RECORDING_BUCKET,
  type PendingRecordingInfo,
  type RecordingUploaderDeps,
} from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const TAB_ID = 4;
const PATH = `${WORKSPACE_ID}/${THREAD_ID}.webm`;
const PENDING: PendingRecordingInfo = { blobUrl: "blob:video", durationMs: 5000, size: 9 };

interface UploadResult {
  error: unknown;
}

function setup(
  options: {
    pending?: PendingRecordingInfo | null;
    blob?: Blob;
    fetchError?: Error;
    uploads?: (UploadResult | Error)[];
    consumeFailure?: () => boolean;
  } = {},
) {
  const blob = options.blob ?? new Blob(["videodata"], { type: "video/webm" });
  const queue = [...(options.uploads ?? [])];
  const upload = vi.fn<(path: string, body: Blob, init: unknown) => Promise<UploadResult>>(() => {
    const next = queue.shift() ?? { error: null };
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const from = vi.fn<(bucket: string) => { upload: typeof upload }>(() => ({ upload }));
  const client = { storage: { from } } as unknown as Pick<SitenoteClient, "storage">;
  const deps: RecordingUploaderDeps = {
    client,
    queryPending: vi.fn<RecordingUploaderDeps["queryPending"]>(() =>
      Promise.resolve(options.pending === undefined ? PENDING : options.pending),
    ),
    fetchBlob: vi.fn<RecordingUploaderDeps["fetchBlob"]>(() =>
      options.fetchError === undefined ? Promise.resolve(blob) : Promise.reject(options.fetchError),
    ),
    release: vi.fn<RecordingUploaderDeps["release"]>(() => Promise.resolve()),
    ...(options.consumeFailure === undefined ? {} : { consumeFailure: options.consumeFailure }),
  };
  return { uploader: createRecordingUploader(deps), deps, upload, from, blob };
}

describe("createRecordingUploader attach", () => {
  it("uploads the pending video under the workspace folder and returns its reference", async () => {
    const { uploader, deps, upload, from, blob } = setup();

    const ref = await uploader.attach(TAB_ID, WORKSPACE_ID, THREAD_ID);

    expect(ref).toEqual({ path: PATH, durationMs: 5000, size: 9 });
    expect(deps.queryPending).toHaveBeenCalledWith(TAB_ID);
    expect(deps.fetchBlob).toHaveBeenCalledWith("blob:video");
    expect(from).toHaveBeenCalledWith(RECORDING_BUCKET);
    expect(upload).toHaveBeenCalledWith(PATH, blob, {
      contentType: "video/webm",
      upsert: false,
    });
  });

  it("answers null without fetching or uploading when nothing is pending", async () => {
    const { uploader, deps, upload } = setup({ pending: null });

    expect(await uploader.attach(TAB_ID, WORKSPACE_ID, THREAD_ID)).toBeNull();
    expect(deps.fetchBlob).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("treats an already existing object as uploaded", async () => {
    for (const error of [
      { message: "Bad", statusCode: "409" },
      { message: "The resource already exists" },
    ]) {
      const { uploader } = setup({ uploads: [{ error }] });

      expect(await uploader.attach(TAB_ID, WORKSPACE_ID, THREAD_ID)).toEqual({
        path: PATH,
        durationMs: 5000,
        size: 9,
      });
    }
  });

  it("answers null when the blob cannot be fetched", async () => {
    const { uploader, upload } = setup({ fetchError: new TypeError("Failed to fetch") });

    expect(await uploader.attach(TAB_ID, WORKSPACE_ID, THREAD_ID)).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it("answers null when the upload fails", async () => {
    const { uploader } = setup({
      uploads: [{ error: { message: "Internal", statusCode: "500" } }],
    });

    expect(await uploader.attach(TAB_ID, WORKSPACE_ID, THREAD_ID)).toBeNull();
  });

  it("answers null when the upload rejects", async () => {
    const { uploader } = setup({ uploads: [new TypeError("Failed to fetch")] });

    expect(await uploader.attach(TAB_ID, WORKSPACE_ID, THREAD_ID)).toBeNull();
  });

  it("answers null for a pending video larger than the limit without fetching it", async () => {
    const { uploader, deps, upload } = setup({
      pending: { ...PENDING, size: RECORDING_MAX_BYTES + 1 },
    });

    expect(await uploader.attach(TAB_ID, WORKSPACE_ID, THREAD_ID)).toBeNull();
    expect(deps.fetchBlob).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("answers null for a fetched blob larger than the limit", async () => {
    const { uploader, upload } = setup({
      blob: { size: RECORDING_MAX_BYTES + 1, type: "video/webm" } as Blob,
    });

    expect(await uploader.attach(TAB_ID, WORKSPACE_ID, THREAD_ID)).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it("skips the upload once when the failure hook says so", async () => {
    const consumeFailure = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const { uploader, upload } = setup({ consumeFailure });

    expect(await uploader.attach(TAB_ID, WORKSPACE_ID, THREAD_ID)).toBeNull();
    expect(upload).not.toHaveBeenCalled();
    expect(await uploader.attach(TAB_ID, WORKSPACE_ID, THREAD_ID)).not.toBeNull();
  });
});

describe("createRecordingUploader discard", () => {
  it("releases the pending video of the tab", async () => {
    const { uploader, deps } = setup();

    uploader.discard(TAB_ID);

    await vi.waitFor(() => {
      expect(deps.release).toHaveBeenCalledExactlyOnceWith(TAB_ID);
    });
  });

  it("releases nothing when the tab has no pending video", async () => {
    const { uploader, deps } = setup({ pending: null });

    uploader.discard(TAB_ID);

    await vi.waitFor(() => {
      expect(deps.queryPending).toHaveBeenCalledWith(TAB_ID);
    });
    expect(deps.release).not.toHaveBeenCalled();
  });
});
