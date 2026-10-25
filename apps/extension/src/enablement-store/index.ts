import * as z from "zod/mini";

import type { StorageAreaLike } from "../session-storage";

export const ENABLEMENT_STORAGE_KEY = "sitenote.sites";

const entrySchema = z.object({
  siteId: z.guid(),
  workspaceId: z.guid(),
  captureErrors: z._default(z.boolean(), true),
});
const mapSchema = z.record(z.string(), entrySchema);

export type EnabledEntry = z.infer<typeof entrySchema>;

export interface EnablementStore {
  get: (origin: string) => Promise<EnabledEntry | null>;
  list: () => Promise<Record<string, EnabledEntry>>;
  set: (origin: string, entry: EnabledEntry) => Promise<void>;
  remove: (origin: string) => Promise<void>;
}

export function createEnablementStore(area: StorageAreaLike): EnablementStore {
  let queue: Promise<unknown> = Promise.resolve();

  async function read(): Promise<Record<string, EnabledEntry>> {
    const stored = await area.get(ENABLEMENT_STORAGE_KEY);
    const raw = stored[ENABLEMENT_STORAGE_KEY];
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

  function serialized<Result>(task: () => Promise<Result>): Promise<Result> {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  }

  async function update(
    change: (map: Record<string, EnabledEntry>) => Record<string, EnabledEntry>,
  ): Promise<void> {
    await area.set({ [ENABLEMENT_STORAGE_KEY]: JSON.stringify(change(await read())) });
  }

  return {
    get: async (origin) => (await read())[origin] ?? null,
    list: read,
    set: (origin, entry) => serialized(() => update((map) => ({ ...map, [origin]: entry }))),
    remove: (origin) =>
      serialized(() =>
        update((map) => Object.fromEntries(Object.entries(map).filter(([key]) => key !== origin))),
      ),
  };
}
