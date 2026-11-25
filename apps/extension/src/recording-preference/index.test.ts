import { describe, expect, it } from "vitest";

import type { StorageAreaLike } from "../session-storage";
import { createRecordingPreference } from ".";

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

describe("createRecordingPreference", () => {
  it("defaults to attaching a comment at the start", async () => {
    expect(await createRecordingPreference(createFakeArea()).load()).toBe("start");
  });

  it("remembers the end placement", async () => {
    const preference = createRecordingPreference(createFakeArea());

    await preference.save("end");

    expect(await preference.load()).toBe("end");
  });

  it("goes back to start without leaving a key behind", async () => {
    const area = createFakeArea();
    const preference = createRecordingPreference(area);
    await preference.save("end");

    await preference.save("start");

    expect(await preference.load()).toBe("start");
    expect(area.snapshot()).toEqual({});
  });

  it("stores under a namespaced key", async () => {
    const area = createFakeArea();

    await createRecordingPreference(area).save("end");

    expect(area.snapshot()).toEqual({ "sitenote.recordingCommentPlacement": "end" });
  });

  it("treats any stored value other than end as start", async () => {
    const area = createFakeArea();
    await area.set({ "sitenote.recordingCommentPlacement": "END" });

    expect(await createRecordingPreference(area).load()).toBe("start");
  });

  it("reports an unreadable store to the caller", async () => {
    const area: StorageAreaLike = {
      get: () => Promise.reject(new Error("storage unavailable")),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };

    await expect(createRecordingPreference(area).load()).rejects.toThrow("storage unavailable");
  });

  it("reports a failed save to the caller", async () => {
    const area: StorageAreaLike = {
      get: () => Promise.resolve({}),
      set: () => Promise.reject(new Error("quota")),
      remove: () => Promise.resolve(),
    };

    await expect(createRecordingPreference(area).save("end")).rejects.toThrow("quota");
  });
});
