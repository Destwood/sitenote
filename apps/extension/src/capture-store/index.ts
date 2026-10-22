export const CAPTURE_LIMIT = 5;
export const CAPTURE_TTL_MS = 10 * 60 * 1000;

export interface CapturedImage {
  blob: Blob;
  width: number;
  height: number;
}

export interface StoredCapture extends CapturedImage {
  at: number;
  threadId: string | null;
  uploaded: boolean;
}

export interface CaptureStoreOptions {
  now?: () => number;
  newId?: () => string;
  limit?: number;
  ttlMs?: number;
}

export interface CaptureStore {
  add: (image: CapturedImage) => string;
  get: (id: string) => StoredCapture | null;
  remove: (id: string) => void;
}

export function createCaptureStore(options: CaptureStoreOptions = {}): CaptureStore {
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const limit = options.limit ?? CAPTURE_LIMIT;
  const ttlMs = options.ttlMs ?? CAPTURE_TTL_MS;
  const entries = new Map<string, StoredCapture>();

  function prune(): void {
    const cutoff = now() - ttlMs;
    for (const [id, capture] of entries) {
      if (capture.at <= cutoff) {
        entries.delete(id);
      }
    }
  }

  return {
    add: (image) => {
      prune();
      const id = newId();
      entries.set(id, { ...image, at: now(), threadId: null, uploaded: false });
      while (entries.size > limit) {
        const oldest = entries.keys().next();
        if (oldest.done) {
          break;
        }
        entries.delete(oldest.value);
      }
      return id;
    },
    get: (id) => {
      prune();
      const capture = entries.get(id);
      if (capture === undefined) {
        return null;
      }
      entries.delete(id);
      entries.set(id, capture);
      return capture;
    },
    remove: (id) => {
      entries.delete(id);
    },
  };
}
