import { describe, expect, it, vi } from "vitest";

import {
  createRecordingDraftStore,
  DRAFT_SCREENSHOT_MAX_BASE64,
  type StoredRecordingDraft,
} from ".";

const ID = "30000000-0000-4000-8000-000000000001";
const draft: StoredRecordingDraft = {
  version: 1,
  at: 1,
  userId: ID,
  workspaceId: ID,
  origin: "https://example.test",
  input: {
    draftId: ID,
    siteId: ID,
    pageUrl: "https://example.test",
    anchor: {
      kind: "text",
      quote: { exact: "Hi", prefix: "", suffix: "" },
      position: { start: 0, end: 2 },
      container: "body",
    },
    context: {
      viewport: { width: 100, height: 100 },
      devicePixelRatio: 1,
      pageTitle: "Test",
      url: "https://example.test/",
      browser: { name: "Chrome", version: "130" },
      os: { name: "Windows", version: "11" },
      userAgent: "ua",
      consoleErrors: [],
      capturedAt: "2026-11-16T10:00:00.000Z",
    },
    body: "Hi",
    mentions: [],
  },
};

function setup() {
  const values: Record<string, unknown> = {};
  const area = {
    get: vi.fn(() => Promise.resolve(structuredClone(values))),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(values, structuredClone(items));
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
      for (const key of [keys].flat()) {
        Reflect.deleteProperty(values, key);
      }
      return Promise.resolve();
    }),
  };
  return { area, values, store: createRecordingDraftStore(area) };
}

describe("recording draft store", () => {
  it("reloads a persisted draft from a fresh instance without a TTL", async () => {
    const { store, area } = setup();
    await store.save(4, draft);
    expect(await createRecordingDraftStore(area).load(4)).toEqual(draft);
    expect(await store.hasAny()).toBe(true);
  });

  it("isolates tabs and clears only the requested tab", async () => {
    const { store } = setup();
    await store.save(4, draft);
    await store.save(5, { ...draft, at: 2 });
    await store.clear(4);
    expect(await store.load(4)).toBeNull();
    expect(await store.load(5)).toMatchObject({ at: 2 });
    await store.clear(5);
    expect(await store.hasAny()).toBe(false);
  });

  it("surfaces quota and read failures", async () => {
    const { store, area } = setup();
    area.set.mockRejectedValueOnce(new Error("quota"));
    await expect(store.save(4, draft)).rejects.toThrow("quota");
    area.get.mockRejectedValueOnce(new Error("read"));
    await expect(store.load(4)).rejects.toThrow("read");
  });

  it("rejects corrupt and oversized snapshots", async () => {
    const { store, values } = setup();
    values["sitenote.recordingDraft.4"] = { ...draft, version: 2 };
    await expect(store.load(4)).rejects.toThrow();
    await expect(
      store.save(4, {
        ...draft,
        screenshot: {
          base64: "A".repeat(DRAFT_SCREENSHOT_MAX_BASE64 + 4),
          mime: "image/png",
          width: 1,
          height: 1,
        },
      }),
    ).rejects.toThrow();
  });
});
