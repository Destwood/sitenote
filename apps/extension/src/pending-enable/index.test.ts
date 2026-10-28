import { describe, expect, it } from "vitest";

import type { StorageAreaLike } from "../session-storage";
import { createPendingEnable, PENDING_ENABLE_KEY } from ".";

const ENTRY = {
  tabId: 7,
  origin: "https://example.test",
  workspaceId: "10000000-0000-4000-8000-000000000001",
};

function createArea(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  const area: StorageAreaLike = {
    get(keys) {
      const wanted = keys === null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      return Promise.resolve(
        Object.fromEntries(
          wanted.filter((key) => data.has(key)).map((key) => [key, data.get(key)]),
        ),
      );
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

describe("createPendingEnable", () => {
  it("stores the entry as JSON and hands it out once for the matching origin", async () => {
    const { area, data } = createArea();
    const pending = createPendingEnable(area);

    await pending.set(ENTRY);

    expect(JSON.parse(data.get(PENDING_ENABLE_KEY) as string)).toEqual(ENTRY);
    expect(await pending.take(ENTRY.origin)).toEqual(ENTRY);
    expect(data.has(PENDING_ENABLE_KEY)).toBe(false);
    expect(await pending.take(ENTRY.origin)).toBeNull();
  });

  it("keeps the entry when another origin takes it", async () => {
    const { area, data } = createArea();
    const pending = createPendingEnable(area);
    await pending.set(ENTRY);

    expect(await pending.take("https://other.test")).toBeNull();
    expect(data.has(PENDING_ENABLE_KEY)).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["not a string", { tabId: 7 }],
    ["invalid JSON", "{"],
    ["a wrong shape", JSON.stringify({ tabId: -1, origin: ENTRY.origin, workspaceId: "x" })],
  ])("returns null when the stored value is %s", async (_name, raw) => {
    const { area } = createArea(raw === undefined ? {} : { [PENDING_ENABLE_KEY]: raw });
    const pending = createPendingEnable(area);

    expect(await pending.take(ENTRY.origin)).toBeNull();
  });

  it("clears the entry", async () => {
    const { area, data } = createArea();
    const pending = createPendingEnable(area);
    await pending.set(ENTRY);

    await pending.clear();

    expect(data.has(PENDING_ENABLE_KEY)).toBe(false);
  });
});
