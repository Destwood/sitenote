import type { RecordingRef } from "@sitenote/core";
import { failure, success, type MessageResult } from "@sitenote/widget";

import type { DataRequest, RecordingStatus } from "../messages";

export type RecordingFinished = Extract<DataRequest, { type: "recording.finished" }>;

export interface RecordingService {
  start: (request: { tabId: number; streamId: string }) => Promise<MessageResult<RecordingStatus>>;
  stop: (tabId?: number) => Promise<MessageResult<null>>;
  status: (tabId?: number) => Promise<MessageResult<RecordingStatus>>;
  onFinished: (finished: RecordingFinished) => Promise<MessageResult<null>>;
  discard: (tabId: number) => void;
  attach: (tabId: number, workspaceId: string, threadId: string) => Promise<RecordingRef | null>;
  onTabRemoved: (tabId: number) => void;
}

export function createNoopRecordingService(): RecordingService {
  return {
    start: () => Promise.resolve(failure("recording_failed")),
    stop: () => Promise.resolve(success(null)),
    status: () => Promise.resolve(success({ state: "idle" })),
    onFinished: () => Promise.resolve(success(null)),
    discard: () => undefined,
    attach: () => Promise.resolve(null),
    onTabRemoved: () => undefined,
  };
}
