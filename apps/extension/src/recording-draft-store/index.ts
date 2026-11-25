import { RECORDING_START_URL_MAX } from "@sitenote/core";
import * as z from "zod/mini";

import { recordingDraftInputSchema } from "../messages";
import type { ReplayStorageArea } from "../replay-progress";

export const DRAFT_SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
export const DRAFT_SCREENSHOT_MAX_BASE64 = 4 * Math.ceil(DRAFT_SCREENSHOT_MAX_BYTES / 3);
const PREFIX = "sitenote.recordingDraft.";

export const storedRecordingDraftSchema = z.object({
  version: z.literal(1),
  at: z.number(),
  userId: z.guid(),
  workspaceId: z.guid(),
  origin: z.url(),
  startUrl: z.optional(z.string().check(z.maxLength(RECORDING_START_URL_MAX))),
  input: recordingDraftInputSchema,
  screenshot: z.optional(
    z.object({
      base64: z
        .string()
        .check(
          z.maxLength(DRAFT_SCREENSHOT_MAX_BASE64),
          z.regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
        ),
      mime: z.enum(["image/png", "image/webp"]),
      width: z.int().check(z.positive()),
      height: z.int().check(z.positive()),
    }),
  ),
});

export type StoredRecordingDraft = z.infer<typeof storedRecordingDraftSchema>;
export interface RecordingDraftStore {
  load(tabId: number): Promise<StoredRecordingDraft | null>;
  save(tabId: number, draft: StoredRecordingDraft): Promise<void>;
  clear(tabId: number): Promise<void>;
  hasAny(): Promise<boolean>;
}

export function createRecordingDraftStore(area: ReplayStorageArea): RecordingDraftStore {
  const keyOf = (tabId: number) => `${PREFIX}${String(tabId)}`;
  return {
    async load(tabId) {
      const key = keyOf(tabId);
      const value = (await area.get(key))[key];
      return value === undefined ? null : storedRecordingDraftSchema.parse(value);
    },
    async save(tabId, draft) {
      await area.set({ [keyOf(tabId)]: storedRecordingDraftSchema.parse(draft) });
    },
    async clear(tabId) {
      await area.remove(keyOf(tabId));
    },
    async hasAny() {
      return Object.keys(await area.get(null)).some((key) => key.startsWith(PREFIX));
    },
  };
}
