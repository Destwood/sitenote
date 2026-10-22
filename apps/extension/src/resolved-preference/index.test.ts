import { describe, expect, it } from "vitest";

import type { StorageAreaLike } from "../session-storage";
import { createResolvedPreference } from ".";

const SITE_ID = "20000000-0000-4000-8000-000000000001";
const OTHER_SITE_ID = "20000000-0000-4000-8000-000000000002";

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

describe("createResolvedPreference", () => {
  it("hides resolved threads until the user asks for them", async () => {
    expect(await createResolvedPreference(createFakeArea()).load(SITE_ID)).toBe(false);
  });

  it("remembers the choice per site", async () => {
    const preference = createResolvedPreference(createFakeArea());

    await preference.save(SITE_ID, true);

    expect(await preference.load(SITE_ID)).toBe(true);
    expect(await preference.load(OTHER_SITE_ID)).toBe(false);
  });

  it("forgets the choice when it is switched off, leaving no key behind", async () => {
    const area = createFakeArea();
    const preference = createResolvedPreference(area);
    await preference.save(SITE_ID, true);

    await preference.save(SITE_ID, false);

    expect(await preference.load(SITE_ID)).toBe(false);
    expect(area.snapshot()).toEqual({});
  });

  it("stores under a namespaced key", async () => {
    const area = createFakeArea();

    await createResolvedPreference(area).save(SITE_ID, true);

    expect(Object.keys(area.snapshot())).toEqual([`sitenote.showResolved.${SITE_ID}`]);
  });

  it("treats an unreadable store as the default", async () => {
    const area: StorageAreaLike = {
      get: () => Promise.reject(new Error("storage unavailable")),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };

    expect(await createResolvedPreference(area).load(SITE_ID)).toBe(false);
  });

  it("reports a failed save to the caller", async () => {
    const area: StorageAreaLike = {
      get: () => Promise.resolve({}),
      set: () => Promise.reject(new Error("quota")),
      remove: () => Promise.resolve(),
    };

    await expect(createResolvedPreference(area).save(SITE_ID, true)).rejects.toThrow("quota");
  });
});
