import type { RecordingStatus } from "../messages";

export const RECORDING_MAX_MS = 120_000;
export const RECORDING_MAX_BYTES = 40 * 1024 * 1024;
export const RECORDING_STOP_BYTES = 39 * 1024 * 1024;
export const RECORDING_TTL_MS = 10 * 60 * 1000;
export const RECORDING_MIME_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

export interface ActiveRecording {
  tabId: number;
  startedAt: number;
}

export interface FinishedRecording {
  tabId: number;
  blob: Blob;
  blobUrl: string;
  durationMs: number;
  size: number;
}

export interface PendingRecording extends FinishedRecording {
  at: number;
}

export interface RecordingStoreOptions {
  now?: () => number;
  ttlMs?: number;
  onExpire?: (recording: PendingRecording) => void;
}

export interface RecordingStore {
  begin: (tabId: number) => boolean;
  finish: (recording: FinishedRecording) => PendingRecording | null;
  query: (tabId: number) => RecordingStatus;
  take: (tabId: number) => PendingRecording | null;
  clear: () => PendingRecording | null;
}

export function pickMimeType(isSupported: (mime: string) => boolean): string | null {
  return RECORDING_MIME_CANDIDATES.find(isSupported) ?? null;
}

export function createRecordingStore(options: RecordingStoreOptions = {}): RecordingStore {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? RECORDING_TTL_MS;
  const onExpire = options.onExpire ?? (() => undefined);
  let active: ActiveRecording | null = null;
  let pending: PendingRecording | null = null;

  function prune(): void {
    if (pending !== null && pending.at <= now() - ttlMs) {
      const expired = pending;
      pending = null;
      onExpire(expired);
    }
  }

  return {
    begin: (tabId) => {
      prune();
      if (active !== null) {
        return false;
      }
      active = { tabId, startedAt: now() };
      return true;
    },
    finish: (recording) => {
      const replaced = pending;
      active = null;
      pending = { ...recording, at: now() };
      return replaced;
    },
    query: (tabId) => {
      prune();
      if (active !== null && active.tabId === tabId) {
        return { state: "recording", startedAt: active.startedAt };
      }
      if (pending !== null && pending.tabId === tabId) {
        return { state: "pending", durationMs: pending.durationMs };
      }
      return { state: "idle" };
    },
    take: (tabId) => {
      prune();
      if (pending?.tabId !== tabId) {
        return null;
      }
      const taken = pending;
      pending = null;
      return taken;
    },
    clear: () => {
      const dropped = pending;
      active = null;
      pending = null;
      return dropped;
    },
  };
}
