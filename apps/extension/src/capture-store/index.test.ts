import { describe, expect, it } from "vitest";

import { CAPTURE_LIMIT, CAPTURE_TTL_MS, createCaptureStore, type CapturedImage } from ".";

function image(name = "a"): CapturedImage {
  return { blob: new Blob([name], { type: "image/webp" }), width: 10, height: 20 };
}

function setup(options: { limit?: number; ttlMs?: number } = {}) {
  let time = 1_000;
  let counter = 0;
  const store = createCaptureStore({
    now: () => time,
    newId: () => `capture-${String((counter += 1))}`,
    ...options,
  });
  return {
    store,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("createCaptureStore", () => {
  it("returns the stored image with an unassigned thread and no upload", () => {
    const { store } = setup();

    const id = store.add(image());

    expect(id).toBe("capture-1");
    expect(store.get(id)).toMatchObject({ width: 10, height: 20, threadId: null, uploaded: false });
  });

  it("returns null for an unknown id and after removal", () => {
    const { store } = setup();
    const id = store.add(image());

    store.remove(id);

    expect(store.get(id)).toBeNull();
    expect(store.get("missing")).toBeNull();
  });

  it("keeps mutations made on the returned entry", () => {
    const { store } = setup();
    const id = store.add(image());

    const entry = store.get(id);
    if (entry === null) {
      throw new Error("missing entry");
    }
    entry.threadId = "thread";
    entry.uploaded = true;

    expect(store.get(id)).toMatchObject({ threadId: "thread", uploaded: true });
  });

  it("keeps at most five captures and drops the least recently used", () => {
    const { store } = setup();
    const ids = Array.from({ length: CAPTURE_LIMIT }, () => store.add(image()));
    store.get(ids[0] ?? "");

    const sixth = store.add(image());

    expect(store.get(ids[1] ?? "")).toBeNull();
    expect(store.get(ids[0] ?? "")).not.toBeNull();
    expect(store.get(sixth)).not.toBeNull();
    for (const id of ids.slice(2)) {
      expect(store.get(id)).not.toBeNull();
    }
  });

  it("honours a custom limit", () => {
    const { store } = setup({ limit: 1 });
    const first = store.add(image());
    const second = store.add(image());

    expect(store.get(first)).toBeNull();
    expect(store.get(second)).not.toBeNull();
  });

  it("drops captures after ten minutes, also when they were read meanwhile", () => {
    const { store, advance } = setup();
    const id = store.add(image());

    advance(CAPTURE_TTL_MS - 1);
    expect(store.get(id)).not.toBeNull();
    advance(1);

    expect(store.get(id)).toBeNull();
  });

  it("prunes expired captures when a new one arrives", () => {
    const { store, advance } = setup({ limit: 2 });
    const old = store.add(image());
    advance(CAPTURE_TTL_MS);
    const fresh = store.add(image());
    const next = store.add(image());

    expect(store.get(old)).toBeNull();
    expect(store.get(fresh)).not.toBeNull();
    expect(store.get(next)).not.toBeNull();
  });
});
