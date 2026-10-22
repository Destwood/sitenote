import { describe, expect, it } from "vitest";

import type { StorageAreaLike } from "../session-storage";
import { createEnablementStore } from ".";

const KEY = "sitenote.sites";
const FIRST = {
  siteId: "20000000-0000-4000-8000-000000000001",
  workspaceId: "10000000-0000-4000-8000-000000000001",
  captureErrors: true,
};
const SECOND = {
  siteId: "20000000-0000-4000-8000-000000000002",
  workspaceId: "10000000-0000-4000-8000-000000000001",
  captureErrors: false,
};

function createArea(initial: Record<string, unknown> = {}, delayMs = 0) {
  const data = new Map<string, unknown>(Object.entries(initial));
  const area: StorageAreaLike = {
    async get(keys) {
      const wanted = keys === null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const key of wanted) {
        if (data.has(key)) {
          result[key] = data.get(key);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return result;
    },
    set(items) {
      for (const [key, value] of Object.entries(items)) {
        data.set(key, value);
      }
      return Promise.resolve();
    },
    remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        data.delete(key);
      }
      return Promise.resolve();
    },
  };
  return { area, data };
}

describe("createEnablementStore", () => {
  it("returns null and an empty list when nothing was stored", async () => {
    const store = createEnablementStore(createArea().area);

    expect(await store.get("https://a.test")).toBeNull();
    expect(await store.list()).toEqual({});
  });

  it("stores an entry per origin and reads it back", async () => {
    const { area, data } = createArea();
    const store = createEnablementStore(area);

    await store.set("https://a.test", FIRST);
    await store.set("http://127.0.0.1:4173", SECOND);

    expect(await store.get("https://a.test")).toEqual(FIRST);
    expect(await store.list()).toEqual({
      "https://a.test": FIRST,
      "http://127.0.0.1:4173": SECOND,
    });
    expect(typeof data.get(KEY)).toBe("string");
  });

  it("replaces the entry of an origin", async () => {
    const store = createEnablementStore(createArea().area);

    await store.set("https://a.test", FIRST);
    await store.set("https://a.test", SECOND);

    expect(await store.list()).toEqual({ "https://a.test": SECOND });
  });

  it("removes only the given origin and tolerates a missing one", async () => {
    const store = createEnablementStore(createArea().area);
    await store.set("https://a.test", FIRST);
    await store.set("https://b.test", SECOND);

    await store.remove("https://a.test");
    await store.remove("https://never.test");

    expect(await store.list()).toEqual({ "https://b.test": SECOND });
  });

  it.each([
    ["a value that is not a string", { [KEY]: { "https://a.test": FIRST } }],
    ["broken JSON", { [KEY]: "{oops" }],
    [
      "entries with the wrong shape",
      { [KEY]: JSON.stringify({ "https://a.test": { siteId: "x" } }) },
    ],
    ["an array", { [KEY]: "[]" }],
  ])("treats %s as an empty map", async (_name, initial) => {
    const store = createEnablementStore(createArea(initial).area);

    expect(await store.list()).toEqual({});
    expect(await store.get("https://a.test")).toBeNull();
  });

  it("keeps every write when changes overlap", async () => {
    const store = createEnablementStore(createArea({}, 5).area);

    await Promise.all([
      store.set("https://a.test", FIRST),
      store.set("https://b.test", SECOND),
      store.set("https://c.test", FIRST),
      store.remove("https://a.test"),
    ]);

    expect(Object.keys(await store.list()).sort()).toEqual(["https://b.test", "https://c.test"]);
  });

  it("recovers after a failed write", async () => {
    const { area } = createArea();
    let fail = true;
    const flaky: StorageAreaLike = {
      ...area,
      set: (items) => {
        if (fail) {
          fail = false;
          return Promise.reject(new Error("quota"));
        }
        return area.set(items);
      },
    };
    const store = createEnablementStore(flaky);

    await expect(store.set("https://a.test", FIRST)).rejects.toThrow("quota");
    await store.set("https://b.test", SECOND);

    expect(await store.list()).toEqual({ "https://b.test": SECOND });
  });
});

describe("captureErrors", () => {
  it("defaults to true for an entry stored by an earlier version", async () => {
    const { area } = createArea({
      [KEY]: JSON.stringify({
        "https://a.test": { siteId: FIRST.siteId, workspaceId: FIRST.workspaceId },
      }),
    });
    const store = createEnablementStore(area);

    expect(await store.get("https://a.test")).toEqual({ ...FIRST, captureErrors: true });
  });

  it("keeps an explicit false", async () => {
    const { area } = createArea();
    const store = createEnablementStore(area);

    await store.set("https://a.test", SECOND);

    expect((await store.get("https://a.test"))?.captureErrors).toBe(false);
  });

  it("rejects an entry whose flag is not a boolean", async () => {
    const { area } = createArea({
      [KEY]: JSON.stringify({ "https://a.test": { ...FIRST, captureErrors: "yes" } }),
    });

    expect(await createEnablementStore(area).list()).toEqual({});
  });
});
