import { describe, expect, it, vi } from "vitest";

import {
  RECORDING_MIME_CANDIDATES,
  RECORDING_TTL_MS,
  createRecordingStore,
  pickMimeType,
  type FinishedRecording,
} from ".";

function recording(tabId: number, blobUrl = `blob:${String(tabId)}`): FinishedRecording {
  return {
    tabId,
    blob: new Blob(["video"], { type: "video/webm" }),
    blobUrl,
    durationMs: 5000,
    size: 1024,
    steps: [],
  };
}

function setup(options: { ttlMs?: number; onExpire?: () => void } = {}) {
  let time = 1_000;
  const store = createRecordingStore({ now: () => time, ...options });
  return {
    store,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("pickMimeType", () => {
  it("picks the first supported candidate in order", () => {
    expect(pickMimeType(() => true)).toBe("video/webm;codecs=vp9");
    expect(pickMimeType((mime) => mime !== "video/webm;codecs=vp9")).toBe("video/webm;codecs=vp8");
    expect(pickMimeType((mime) => mime === "video/webm")).toBe("video/webm");
  });

  it("returns null when no candidate is supported", () => {
    expect(pickMimeType(() => false)).toBeNull();
    expect(RECORDING_MIME_CANDIDATES).toHaveLength(3);
  });
});

describe("createRecordingStore", () => {
  it("refuses a second begin while a recording is active, even for another tab", () => {
    const { store } = setup();

    expect(store.begin(1)).toBe(true);
    expect(store.begin(1)).toBe(false);
    expect(store.begin(2)).toBe(false);
  });

  it("reports the active recording only for its tab", () => {
    const { store, advance } = setup();
    store.begin(1);
    advance(250);

    expect(store.query(1)).toEqual({ state: "recording", startedAt: 1_000 });
    expect(store.query(2)).toEqual({ state: "idle" });
  });

  it("moves the finished recording to pending and frees the active slot", () => {
    const { store } = setup();
    store.begin(1);

    expect(store.finish(recording(1))).toBeNull();

    expect(store.query(1)).toEqual({ state: "pending", durationMs: 5000 });
    expect(store.begin(2)).toBe(true);
  });

  it("returns the evicted pending recording when a newer one replaces it", () => {
    const { store } = setup();
    store.begin(1);
    store.finish(recording(1, "blob:old"));
    store.begin(2);

    const evicted = store.finish(recording(2, "blob:new"));

    expect(evicted).toMatchObject({ tabId: 1, blobUrl: "blob:old" });
    expect(store.query(1)).toEqual({ state: "idle" });
    expect(store.query(2)).toEqual({ state: "pending", durationMs: 5000 });
  });

  it("hands the pending recording over once and only to its tab", () => {
    const { store } = setup();
    store.begin(1);
    store.finish(recording(1, "blob:one"));

    expect(store.take(2)).toBeNull();
    expect(store.take(1)).toMatchObject({ tabId: 1, blobUrl: "blob:one", at: 1_000 });
    expect(store.take(1)).toBeNull();
    expect(store.query(1)).toEqual({ state: "idle" });
  });

  it("keeps the steps of the finished recording until it is taken", () => {
    const { store } = setup();
    const step = { t: 300, kind: "click" as const, selector: "#save", label: "Save" };
    store.begin(1);
    store.finish({ ...recording(1), steps: [step] });

    expect(store.take(1)).toMatchObject({ tabId: 1, steps: [step] });
  });

  it("drops a pending recording after ten minutes and tells the caller", () => {
    const onExpire = vi.fn();
    const { store, advance } = setup({ onExpire });
    store.begin(1);
    store.finish(recording(1, "blob:old"));

    advance(RECORDING_TTL_MS - 1);
    expect(store.query(1)).toEqual({ state: "pending", durationMs: 5000 });
    expect(onExpire).not.toHaveBeenCalled();

    advance(1);
    expect(store.query(1)).toEqual({ state: "idle" });
    expect(onExpire).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ tabId: 1, blobUrl: "blob:old" }),
    );
    expect(store.take(1)).toBeNull();
  });

  it("honours a custom ttl", () => {
    const { store, advance } = setup({ ttlMs: 100 });
    store.begin(1);
    store.finish(recording(1));

    advance(100);

    expect(store.take(1)).toBeNull();
  });

  it("clears both slots and returns the dropped pending recording", () => {
    const { store } = setup();
    store.begin(1);
    store.finish(recording(1, "blob:one"));
    store.begin(2);

    expect(store.clear()).toMatchObject({ tabId: 1, blobUrl: "blob:one" });
    expect(store.query(2)).toEqual({ state: "idle" });
    expect(store.clear()).toBeNull();
    expect(store.begin(2)).toBe(true);
  });

  it("cancels only the active recording and keeps the pending one", () => {
    const { store } = setup();
    store.begin(1);
    store.finish(recording(1, "blob:one"));
    store.begin(2);

    store.cancel();

    expect(store.snapshot()).toMatchObject({
      active: null,
      pending: { tabId: 1, blobUrl: "blob:one" },
    });
  });

  it("releases only the pending recording and keeps the active one", () => {
    const { store } = setup();
    store.begin(1);
    store.finish(recording(1, "blob:one"));
    store.begin(2);

    expect(store.release()).toMatchObject({ tabId: 1, blobUrl: "blob:one" });
    expect(store.release()).toBeNull();
    expect(store.snapshot()).toMatchObject({ active: { tabId: 2 }, pending: null });
  });

  it("reports both slots in a snapshot", () => {
    const { store, advance } = setup();
    store.begin(1);
    store.finish(recording(1));
    store.begin(2);
    advance(100);

    const { active, pending } = store.snapshot();
    expect(active).toEqual({ tabId: 2, startedAt: 1_000 });
    expect(pending).toMatchObject({ tabId: 1, at: 1_000 });
  });
});
