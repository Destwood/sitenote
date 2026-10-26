import * as z from "zod/mini";

import type { StorageAreaLike } from "../session-storage";

export const PENDING_ENABLE_STORAGE_KEY = "sitenote.pending-enable";
export const PENDING_ENABLE_MAX_AGE_MS = 2 * 60 * 1000;

const entrySchema = z.object({
  tabId: z.int().check(z.nonnegative()),
  workspaceId: z.guid(),
  at: z.number(),
});
const mapSchema = z.record(z.string(), entrySchema);

export type PendingEnable = z.infer<typeof entrySchema>;

export interface PendingEnableStore {
  put: (origin: string, entry: PendingEnable) => Promise<void>;
  take: (origin: string, nowMs: number) => Promise<PendingEnable | null>;
  remove: (origin: string) => Promise<void>;
}

export function createPendingEnableStore(area: StorageAreaLike): PendingEnableStore {
  let queue: Promise<unknown> = Promise.resolve();

  async function read(): Promise<Record<string, PendingEnable>> {
    const stored = await area.get(PENDING_ENABLE_STORAGE_KEY);
    const raw = stored[PENDING_ENABLE_STORAGE_KEY];
    if (typeof raw !== "string") {
      return {};
    }
    try {
      const parsed = mapSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : {};
    } catch {
      return {};
    }
  }

  async function write(map: Record<string, PendingEnable>): Promise<void> {
    await area.set({ [PENDING_ENABLE_STORAGE_KEY]: JSON.stringify(map) });
  }

  function serialized<Result>(task: () => Promise<Result>): Promise<Result> {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  }

  function without(map: Record<string, PendingEnable>, origin: string) {
    return Object.fromEntries(Object.entries(map).filter(([key]) => key !== origin));
  }

  return {
    put: (origin, entry) =>
      serialized(async () => {
        await write({ ...(await read()), [origin]: entry });
      }),
    take: (origin, nowMs) =>
      serialized(async () => {
        const map = await read();
        const entry = map[origin];
        if (entry === undefined) {
          return null;
        }
        await write(without(map, origin));
        const age = nowMs - entry.at;
        return age >= 0 && age <= PENDING_ENABLE_MAX_AGE_MS ? entry : null;
      }),
    remove: (origin) =>
      serialized(async () => {
        await write(without(await read(), origin));
      }),
  };
}
