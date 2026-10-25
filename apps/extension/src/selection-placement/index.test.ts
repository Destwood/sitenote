import { describe, expect, it } from "vitest";

import type { StorageAreaLike } from "../session-storage";
import { createSelectionPlacementPreference } from ".";

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

describe("createSelectionPlacementPreference", () => {
  it("places the comment button below the selection by default", async () => {
    expect(await createSelectionPlacementPreference(createFakeArea()).load()).toBe("below");
  });

  it("remembers the above placement", async () => {
    const preference = createSelectionPlacementPreference(createFakeArea());

    await preference.save("above");

    expect(await preference.load()).toBe("above");
  });

  it("goes back to below without leaving a key behind", async () => {
    const area = createFakeArea();
    const preference = createSelectionPlacementPreference(area);
    await preference.save("above");

    await preference.save("below");

    expect(await preference.load()).toBe("below");
    expect(area.snapshot()).toEqual({});
  });

  it("stores under a namespaced key", async () => {
    const area = createFakeArea();

    await createSelectionPlacementPreference(area).save("above");

    expect(area.snapshot()).toEqual({ "sitenote.selectionPlacement": "above" });
  });

  it("treats any stored value other than above as below", async () => {
    const area = createFakeArea();
    await area.set({ "sitenote.selectionPlacement": "ABOVE" });

    expect(await createSelectionPlacementPreference(area).load()).toBe("below");
  });

  it("treats an unreadable store as the default", async () => {
    const area: StorageAreaLike = {
      get: () => Promise.reject(new Error("storage unavailable")),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };

    expect(await createSelectionPlacementPreference(area).load()).toBe("below");
  });

  it("reports a failed save to the caller", async () => {
    const area: StorageAreaLike = {
      get: () => Promise.resolve({}),
      set: () => Promise.reject(new Error("quota")),
      remove: () => Promise.resolve(),
    };

    await expect(createSelectionPlacementPreference(area).save("above")).rejects.toThrow("quota");
  });
});
