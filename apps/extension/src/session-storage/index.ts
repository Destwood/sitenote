import type { SupportedStorage } from "@supabase/supabase-js";

const KEY_PREFIX = "sitenote.auth.";

export interface StorageAreaLike {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, string>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface SessionStorage extends SupportedStorage {
  clear(): Promise<void>;
}

export function createSessionStorage(area: StorageAreaLike): SessionStorage {
  return {
    async getItem(key) {
      const stored = await area.get(KEY_PREFIX + key);
      const value = stored[KEY_PREFIX + key];
      return typeof value === "string" ? value : null;
    },
    async setItem(key, value) {
      await area.set({ [KEY_PREFIX + key]: value });
    },
    async removeItem(key) {
      await area.remove(KEY_PREFIX + key);
    },
    async clear() {
      const everything = await area.get(null);
      const owned = Object.keys(everything).filter((key) => key.startsWith(KEY_PREFIX));
      if (owned.length > 0) {
        await area.remove(owned);
      }
    },
  };
}
