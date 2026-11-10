import {
  parsePageUrl,
  RECORDING_START_URL_MAX,
  type RecordingRef,
  type RecordingStep,
} from "@sitenote/core";
import { failure, success, type MessageResult } from "@sitenote/widget";

import type { EnabledEntry } from "../enablement-store";
import type {
  DataRequest,
  OffscreenCommand,
  OffscreenResponse,
  RecordingReadyMessage,
  RecordingStateMessage,
  RecordingStatus,
} from "../messages";
import { type ThreadRecordings } from "../recording-upload";
import { originOfTabUrl } from "../tab-access";

export type RecordingFinished = Extract<DataRequest, { type: "recording.finished" }>;

export interface RecordingService {
  start: (request: { tabId: number; streamId: string }) => Promise<MessageResult<RecordingStatus>>;
  stop: (tabId?: number) => Promise<MessageResult<null>>;
  status: (tabId?: number) => Promise<MessageResult<RecordingStatus>>;
  onFinished: (finished: RecordingFinished) => Promise<MessageResult<null>>;
  discard: (tabId: number) => void;
  attach: (tabId: number, workspaceId: string, threadId: string) => Promise<RecordingRef | null>;
  addStep: (tabId: number, step: RecordingStep) => Promise<MessageResult<null>>;
  onTabRemoved: (tabId: number) => void;
}

export interface OffscreenDocument {
  hasDocument: () => Promise<boolean>;
  createDocument: () => Promise<void>;
  closeDocument: () => Promise<void>;
}

export interface RecordingServiceDeps {
  tabs: { get: (tabId: number) => Promise<{ url?: string | undefined } | null> };
  getEnabledSite: (origin: string) => Promise<EnabledEntry | null>;
  offscreen: OffscreenDocument;
  sendToOffscreen: (command: OffscreenCommand) => Promise<OffscreenResponse>;
  sendToTab: (
    tabId: number,
    message: RecordingStateMessage | RecordingReadyMessage,
  ) => Promise<void>;
  badge: {
    set: (tabId: number, text: string) => Promise<void>;
    clear: (tabId: number) => Promise<void>;
  };
  maxMs: number;
  stopBytes: number;
  recordings: ThreadRecordings;
}

type QueryCommand = Extract<OffscreenCommand, { type: "offscreen.query" }>;

export const RECORDING_BADGE_COLOR = "#dc2626";

function startUrlOf(url: string | undefined): string | undefined {
  return url === undefined || parsePageUrl(url) === null
    ? undefined
    : url.slice(0, RECORDING_START_URL_MAX);
}

export function createNoopRecordingService(): RecordingService {
  return {
    start: () => Promise.resolve(failure("recording_failed")),
    stop: () => Promise.resolve(success(null)),
    status: () => Promise.resolve(success({ state: "idle" })),
    onFinished: () => Promise.resolve(success(null)),
    discard: () => undefined,
    attach: () => Promise.resolve(null),
    addStep: () => Promise.resolve(success(null)),
    onTabRemoved: () => undefined,
  };
}

function quiet(task: Promise<unknown>): Promise<void> {
  return task.then(
    () => undefined,
    () => undefined,
  );
}

export function createRecordingService(deps: RecordingServiceDeps): RecordingService {
  let creating: Promise<void> | null = null;
  const startUrls = new Map<number, string>();

  function ensureDocument(): Promise<void> {
    creating ??= (async () => {
      if (!(await deps.offscreen.hasDocument())) {
        await deps.offscreen.createDocument();
      }
    })().finally(() => {
      creating = null;
    });
    return creating;
  }

  async function ask(command: QueryCommand): Promise<RecordingStatus> {
    try {
      if (!(await deps.offscreen.hasDocument())) {
        return { state: "idle" };
      }
      const reply = await deps.sendToOffscreen(command);
      if (!reply.ok) {
        return { state: "idle" };
      }
      const { state, startedAt, durationMs } = reply.data;
      return { state, startedAt, durationMs };
    } catch {
      return { state: "idle" };
    }
  }

  async function closeWhenIdle(): Promise<void> {
    if (
      (await deps.offscreen.hasDocument()) &&
      (await ask({ type: "offscreen.query" })).state === "idle"
    ) {
      await quiet(deps.offscreen.closeDocument());
    }
  }

  async function releaseTab(tabId: number): Promise<void> {
    if ((await ask({ type: "offscreen.query", tabId })).state === "pending") {
      await quiet(deps.sendToOffscreen({ type: "offscreen.release" }));
    }
    await closeWhenIdle();
  }

  return {
    start: async ({ tabId, streamId }) => {
      const url = (await deps.tabs.get(tabId))?.url;
      const origin = originOfTabUrl(url);
      if (origin === null || (await deps.getEnabledSite(origin)) === null) {
        return failure("forbidden");
      }
      try {
        await ensureDocument();
        const reply = await deps.sendToOffscreen({
          type: "offscreen.start",
          tabId,
          streamId,
          maxMs: deps.maxMs,
          stopBytes: deps.stopBytes,
        });
        if (!reply.ok) {
          return failure(
            reply.error.code === "recording_busy" ? "recording_busy" : "recording_failed",
          );
        }
        const { startedAt } = reply.data;
        await quiet(deps.badge.set(tabId, "REC"));
        await quiet(deps.sendToTab(tabId, { type: "recording.state", recording: true, startedAt }));
        const startUrl = startUrlOf(url);
        startUrls.delete(tabId);
        if (startUrl !== undefined) {
          startUrls.set(tabId, startUrl);
        }
        return success({ state: "recording", startedAt });
      } catch {
        return failure("recording_failed");
      }
    },
    stop: async (tabId) => {
      if (
        tabId === undefined ||
        (await ask({ type: "offscreen.query", tabId })).state === "recording"
      ) {
        await quiet(deps.sendToOffscreen({ type: "offscreen.stop", discard: false }));
      }
      return success(null);
    },
    status: async (tabId) =>
      success(
        tabId === undefined ? { state: "idle" } : await ask({ type: "offscreen.query", tabId }),
      ),
    onFinished: async (finished) => {
      const { tabId } = finished;
      await quiet(deps.badge.clear(tabId));
      await quiet(deps.sendToTab(tabId, { type: "recording.state", recording: false }));
      if ((await deps.tabs.get(tabId)) === null) {
        await quiet(releaseTab(tabId));
        return success(null);
      }
      if (finished.reason !== "error" && finished.size > 0) {
        await quiet(
          deps.sendToTab(tabId, { type: "recording.ready", durationMs: finished.durationMs }),
        );
      }
      return success(null);
    },
    discard: (tabId) => {
      startUrls.delete(tabId);
      deps.recordings.discard(tabId);
      void quiet(closeWhenIdle());
    },
    attach: async (tabId, workspaceId, threadId) => {
      const startUrl = startUrls.get(tabId);
      startUrls.delete(tabId);
      const ref = await deps.recordings.attach(tabId, workspaceId, threadId);
      return ref === null || startUrl === undefined ? ref : { ...ref, startUrl };
    },
    addStep: async (tabId, step) => {
      if ((await ask({ type: "offscreen.query", tabId })).state === "recording") {
        await quiet(deps.sendToOffscreen({ type: "offscreen.step", tabId, step }));
      }
      return success(null);
    },
    onTabRemoved: (tabId) => {
      startUrls.delete(tabId);
      void quiet(
        (async () => {
          if ((await ask({ type: "offscreen.query", tabId })).state === "recording") {
            await deps.sendToOffscreen({ type: "offscreen.stop", discard: true });
          }
          await releaseTab(tabId);
        })(),
      );
    },
  };
}
