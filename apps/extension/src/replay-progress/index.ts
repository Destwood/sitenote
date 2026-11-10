import type { ReplayProgress } from "@sitenote/widget";

import { replayProgressSchema } from "../messages";

export const REPLAY_TTL_MS = 10 * 60 * 1000;

export interface ReplayStorageArea {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface ReplayProgressService {
  load(tabId: number): Promise<ReplayProgress | null>;
  save(tabId: number, progress: ReplayProgress): Promise<void>;
  clear(tabId: number): Promise<void>;
}

export interface ReplayProgressOptions {
  now?: () => number;
}

function keyOf(tabId: number): string {
  return `sitenote.replay.${String(tabId)}`;
}

export function createReplayProgress(
  area: ReplayStorageArea,
  options: ReplayProgressOptions = {},
): ReplayProgressService {
  const now = options.now ?? Date.now;
  return {
    async load(tabId) {
      const key = keyOf(tabId);
      const parsed = replayProgressSchema.safeParse((await area.get(key))[key]);
      if (parsed.success && parsed.data.at + REPLAY_TTL_MS >= now()) {
        return parsed.data;
      }
      await area.remove(key);
      return null;
    },
    async save(tabId, progress) {
      await area.set({ [keyOf(tabId)]: progress });
    },
    async clear(tabId) {
      await area.remove(keyOf(tabId));
    },
  };
}
