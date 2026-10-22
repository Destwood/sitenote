import type { StorageAreaLike } from "../session-storage";

const KEY_PREFIX = "sitenote.showResolved.";
const ENABLED = "1";

export interface ResolvedPreference {
  load: (siteId: string) => Promise<boolean>;
  save: (siteId: string, show: boolean) => Promise<void>;
}

export function createResolvedPreference(area: StorageAreaLike): ResolvedPreference {
  return {
    load: async (siteId) => {
      const key = KEY_PREFIX + siteId;
      try {
        return (await area.get(key))[key] === ENABLED;
      } catch {
        return false;
      }
    },
    save: async (siteId, show) => {
      const key = KEY_PREFIX + siteId;
      await (show ? area.set({ [key]: ENABLED }) : area.remove(key));
    },
  };
}
