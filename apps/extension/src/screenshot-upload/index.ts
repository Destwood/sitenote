import type { SitenoteClient } from "@sitenote/db";

import type { CaptureStore } from "../capture-store";

export const SCREENSHOT_BUCKET = "screenshots";
const DUPLICATE_STATUS = "409";
const DUPLICATE_MESSAGE = /already exists/i;

export interface ScreenshotAttachment {
  threadId: string;
  path: string | null;
}

export interface ThreadScreenshots {
  attach: (captureId: string, workspaceId: string) => Promise<ScreenshotAttachment | null>;
  discard: (captureId: string) => void;
}

export interface ScreenshotUploaderDeps {
  client: Pick<SitenoteClient, "storage">;
  store: CaptureStore;
  newId?: () => string;
  consumeFailure?: () => boolean;
}

export function extensionOf(contentType: string): "png" | "webp" {
  return contentType === "image/png" ? "png" : "webp";
}

function isDuplicate(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const fields = error as { statusCode?: unknown; message?: unknown };
  return (
    String(fields.statusCode) === DUPLICATE_STATUS ||
    (typeof fields.message === "string" && DUPLICATE_MESSAGE.test(fields.message))
  );
}

export function createScreenshotUploader(deps: ScreenshotUploaderDeps): ThreadScreenshots {
  const newId = deps.newId ?? (() => crypto.randomUUID());

  return {
    attach: async (captureId, workspaceId) => {
      const capture = deps.store.get(captureId);
      if (capture === null) {
        return null;
      }
      const threadId = capture.threadId ?? newId();
      capture.threadId = threadId;
      if (capture.uploaded) {
        return { threadId, path: `${workspaceId}/${threadId}.${extensionOf(capture.blob.type)}` };
      }
      if (deps.consumeFailure?.() === true) {
        return { threadId, path: null };
      }
      const path = `${workspaceId}/${threadId}.${extensionOf(capture.blob.type)}`;
      try {
        const result = await deps.client.storage
          .from(SCREENSHOT_BUCKET)
          .upload(path, capture.blob, { contentType: capture.blob.type, upsert: false });
        if (result.error !== null && !isDuplicate(result.error)) {
          return { threadId, path: null };
        }
      } catch {
        return { threadId, path: null };
      }
      capture.uploaded = true;
      return { threadId, path };
    },
    discard: (captureId) => {
      deps.store.remove(captureId);
    },
  };
}
