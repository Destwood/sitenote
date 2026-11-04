import type { RecordingRef, RecordingStep } from "@sitenote/core";
import type { SitenoteClient } from "@sitenote/db";

import { RECORDING_MAX_BYTES } from "../recording-store";
import { isDuplicate } from "../screenshot-upload";

export const RECORDING_BUCKET = "recordings";
const RECORDING_CONTENT_TYPE = "video/webm";

export interface PendingRecordingInfo {
  blobUrl: string;
  durationMs: number;
  size: number;
  steps?: RecordingStep[];
}

export interface ThreadRecordings {
  attach: (tabId: number, workspaceId: string, threadId: string) => Promise<RecordingRef | null>;
  discard: (tabId: number) => void;
}

export interface RecordingUploaderDeps {
  client: Pick<SitenoteClient, "storage">;
  queryPending: (tabId: number) => Promise<PendingRecordingInfo | null>;
  fetchBlob: (url: string) => Promise<Blob>;
  release: (tabId: number) => Promise<void>;
  consumeFailure?: () => boolean;
}

export function createRecordingUploader(deps: RecordingUploaderDeps): ThreadRecordings {
  return {
    attach: async (tabId, workspaceId, threadId) => {
      try {
        const pending = await deps.queryPending(tabId);
        if (pending === null || pending.size > RECORDING_MAX_BYTES) {
          return null;
        }
        if (deps.consumeFailure?.() === true) {
          return null;
        }
        const blob = await deps.fetchBlob(pending.blobUrl);
        if (blob.size > RECORDING_MAX_BYTES) {
          return null;
        }
        const path = `${workspaceId}/${threadId}.webm`;
        const result = await deps.client.storage
          .from(RECORDING_BUCKET)
          .upload(path, blob, { contentType: RECORDING_CONTENT_TYPE, upsert: false });
        if (result.error !== null && !isDuplicate(result.error)) {
          return null;
        }
        return {
          path,
          durationMs: pending.durationMs,
          size: blob.size,
          ...(pending.steps === undefined || pending.steps.length === 0
            ? {}
            : { steps: pending.steps }),
        };
      } catch {
        return null;
      }
    },
    discard: (tabId) => {
      void (async () => {
        if ((await deps.queryPending(tabId)) !== null) {
          await deps.release(tabId);
        }
      })().catch(() => undefined);
    },
  };
}
