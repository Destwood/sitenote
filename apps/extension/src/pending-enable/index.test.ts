import { describe, expect, it } from "vitest";

import type { StorageAreaLike } from "../session-storage";
import { PENDING_ENABLE_MAX_AGE_MS, createPendingEnableStore } from ".";

const ORIGIN = "https://example.test";
const ENTRY = { tabId: 7, workspaceId: "10000000-0000-4000-8000-000000000001", at: 1000 };

function createArea(initial: Record<string, unknown> = {}): StorageAreaLike {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
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
}

describe("pending enable store", () => {
  it("hands an entry over once and forgets it", async () => {
    const store = createPendingEnableStore(createArea());
    await store.put(ORIGIN, ENTRY);

    expect(await store.take(ORIGIN, ENTRY.at + 1)).toEqual(ENTRY);
    expect(await store.take(ORIGIN, ENTRY.at + 1)).toBeNull();
  });

  it("returns null for an origin nobody asked about", async () => {
    const store = createPendingEnableStore(createArea());

    expect(await store.take(ORIGIN, 0)).toBeNull();
  });

  it("drops an entry that is older than the limit", async () => {
    const store = createPendingEnableStore(createArea());
    await store.put(ORIGIN, ENTRY);

    expect(await store.take(ORIGIN, ENTRY.at + PENDING_ENABLE_MAX_AGE_MS + 1)).toBeNull();
    expect(await store.take(ORIGIN, ENTRY.at + 1)).toBeNull();
  });

  it("removes an entry on request and keeps the others", async () => {
    const store = createPendingEnableStore(createArea());
    await store.put(ORIGIN, ENTRY);
    await store.put("https://other.test", ENTRY);

    await store.remove(ORIGIN);

    expect(await store.take(ORIGIN, ENTRY.at)).toBeNull();
    expect(await store.take("https://other.test", ENTRY.at)).toEqual(ENTRY);
  });

  it("ignores stored data that does not match the schema", async () => {
    const store = createPendingEnableStore(
      createArea({ "sitenote.pending-enable": JSON.stringify({ [ORIGIN]: { tabId: "x" } }) }),
    );

    expect(await store.take(ORIGIN, 0)).toBeNull();
  });

  it("keeps concurrent writes", async () => {
    const store = createPendingEnableStore(createArea());

    await Promise.all([store.put(ORIGIN, ENTRY), store.put("https://other.test", ENTRY)]);

    expect(await store.take(ORIGIN, ENTRY.at)).toEqual(ENTRY);
    expect(await store.take("https://other.test", ENTRY.at)).toEqual(ENTRY);
  });
});
