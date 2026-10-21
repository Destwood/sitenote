import { beforeEach, describe, expect, it } from "vitest";

import { createSessionStorage, type StorageAreaLike } from ".";

function createFakeArea(): StorageAreaLike & { snapshot(): Record<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    get(keys) {
      const wanted = keys === null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const key of wanted) {
        if (data.has(key)) {
          result[key] = data.get(key);
        }
      }
      return Promise.resolve(result);
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
    snapshot: () => Object.fromEntries(data),
  };
}

describe("createSessionStorage", () => {
  let area: ReturnType<typeof createFakeArea>;

  beforeEach(() => {
    area = createFakeArea();
  });

  it("returns null for a key that was never written", async () => {
    expect(await createSessionStorage(area).getItem("sb-token")).toBeNull();
  });

  it("stores a value under a namespaced key and reads it back", async () => {
    const storage = createSessionStorage(area);

    await storage.setItem("sb-token", '{"access_token":"a"}');

    expect(await storage.getItem("sb-token")).toBe('{"access_token":"a"}');
    expect(Object.keys(area.snapshot())).toEqual(["sitenote.auth.sb-token"]);
  });

  it("overwrites an existing value", async () => {
    const storage = createSessionStorage(area);

    await storage.setItem("sb-token", "one");
    await storage.setItem("sb-token", "two");

    expect(await storage.getItem("sb-token")).toBe("two");
  });

  it("removes only the requested key", async () => {
    const storage = createSessionStorage(area);
    await storage.setItem("sb-token", "one");
    await storage.setItem("sb-token-code-verifier", "two");

    await storage.removeItem("sb-token");

    expect(await storage.getItem("sb-token")).toBeNull();
    expect(await storage.getItem("sb-token-code-verifier")).toBe("two");
  });

  it("ignores a stored value that is not a string", async () => {
    await area.set({ "sitenote.auth.sb-token": 42 as unknown as string });

    expect(await createSessionStorage(area).getItem("sb-token")).toBeNull();
  });

  it("clear removes every owned key and leaves foreign keys alone", async () => {
    const storage = createSessionStorage(area);
    await storage.setItem("sb-token", "one");
    await storage.setItem("sb-token-code-verifier", "two");
    await area.set({ unrelated: "keep" });

    await storage.clear();

    expect(area.snapshot()).toEqual({ unrelated: "keep" });
  });

  it("clear does nothing on an empty area", async () => {
    await createSessionStorage(area).clear();

    expect(area.snapshot()).toEqual({});
  });
});
