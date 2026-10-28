import * as z from "zod/mini";

import type { StorageAreaLike } from "../session-storage";

export const PENDING_ENABLE_KEY = "sitenote.pendingEnable";

const entrySchema = z.object({
  tabId: z.int().check(z.nonnegative()),
  origin: z.string(),
  workspaceId: z.guid(),
});

export type PendingEnable = z.infer<typeof entrySchema>;

export interface PendingEnableStore {
  set: (entry: PendingEnable) => Promise<void>;
  take: (origin: string) => Promise<PendingEnable | null>;
  clear: () => Promise<void>;
}

export function createPendingEnable(area: StorageAreaLike): PendingEnableStore {
  async function read(): Promise<PendingEnable | null> {
    const stored = await area.get(PENDING_ENABLE_KEY);
    const raw = stored[PENDING_ENABLE_KEY];
    if (typeof raw !== "string") {
      return null;
    }
    try {
      const parsed = entrySchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  return {
    async set(entry) {
      await area.set({ [PENDING_ENABLE_KEY]: JSON.stringify(entry) });
    },
    async take(origin) {
      const entry = await read();
      if (entry?.origin !== origin) {
        return null;
      }
      await area.remove(PENDING_ENABLE_KEY);
      return entry;
    },
    async clear() {
      await area.remove(PENDING_ENABLE_KEY);
    },
  };
}
