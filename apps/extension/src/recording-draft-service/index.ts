import { parsePageUrl, RECORDING_START_URL_MAX } from "@sitenote/core";
import {
  failure,
  success,
  type MessageResult,
  type RecordingDraftInput,
  type RecordingDraftOutcome,
  type ThreadRecord,
} from "@sitenote/widget";

import type { AuthService } from "../auth-service";
import type { CaptureStore } from "../capture-store";
import type { DataService } from "../data-service";
import type { EnabledEntry } from "../enablement-store";
import type { RecordingDraftMessage, RecordingStatus } from "../messages";
import {
  DRAFT_SCREENSHOT_MAX_BYTES,
  type RecordingDraftStore,
  type StoredRecordingDraft,
} from "../recording-draft-store";
import type { RecordingFinished, RecordingService } from "../recording-service";

export interface RecordingDraftService {
  prepare: (tabId: number) => Promise<MessageResult<null>>;
  submit: (
    tabId: number,
    input: RecordingDraftInput,
  ) => Promise<MessageResult<RecordingDraftOutcome>>;
  start: (request: { tabId: number; streamId: string }) => Promise<MessageResult<RecordingStatus>>;
  onFinished: (finished: RecordingFinished) => Promise<boolean>;
  onTabRemoved: (tabId: number) => Promise<void>;
}

export interface RecordingDraftServiceDeps {
  store: RecordingDraftStore;
  captures: CaptureStore;
  auth: Pick<AuthService, "getState">;
  data: Pick<DataService, "createThread">;
  recordings: Pick<RecordingService, "start" | "discard">;
  getTab(tabId: number): Promise<{ url?: string | undefined } | null>;
  getEnabledSite(origin: string): Promise<EnabledEntry | null>;
  isRecording(): Promise<boolean>;
  getMediaStreamId(tabId: number): Promise<string>;
  sendToTab(tabId: number, message: RecordingDraftMessage): Promise<unknown>;
}

export function createRecordingDraftService(
  deps: RecordingDraftServiceDeps,
): RecordingDraftService {
  let busy = false;
  const removed = new Set<number>();
  const finishing = new Map<number, Promise<boolean>>();

  async function exclusive<T>(run: () => Promise<MessageResult<T>>): Promise<MessageResult<T>> {
    if (busy || finishing.size > 0) {
      return failure("recording_busy");
    }
    busy = true;
    try {
      if ((await deps.store.hasAny()) || (await deps.isRecording())) {
        return failure("recording_busy");
      }
      return await run();
    } catch {
      return failure("recording_failed");
    } finally {
      busy = false;
    }
  }

  async function snapshot(input: RecordingDraftInput): Promise<StoredRecordingDraft["screenshot"]> {
    const capture = input.captureId === undefined ? null : deps.captures.get(input.captureId);
    if (
      capture === null ||
      capture.blob.size > DRAFT_SCREENSHOT_MAX_BYTES ||
      (capture.blob.type !== "image/png" && capture.blob.type !== "image/webp")
    ) {
      return undefined;
    }
    const bytes = new Uint8Array(await capture.blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return {
      base64: btoa(binary),
      mime: capture.blob.type,
      width: capture.width,
      height: capture.height,
    };
  }

  async function post(
    tabId: number,
    draft: StoredRecordingDraft,
    attachRecording: boolean,
  ): Promise<MessageResult<ThreadRecord>> {
    if (removed.has(tabId)) {
      return failure("page_unavailable");
    }
    const { screenshot, input } = draft;
    let captureId: string | undefined;
    if (screenshot !== undefined && input.captureId !== undefined) {
      try {
        const bytes = Uint8Array.from(atob(screenshot.base64), (char) => char.charCodeAt(0));
        deps.captures.restore(input.captureId, {
          blob: new Blob([bytes], { type: screenshot.mime }),
          width: screenshot.width,
          height: screenshot.height,
          at: Date.now(),
          threadId: input.draftId,
          uploaded: false,
        });
        captureId = input.captureId;
      } catch {
        captureId = undefined;
      }
    }
    const { draftId, ...request } = input;
    delete request.captureId;
    return deps.data.createThread(
      {
        type: "threads.create",
        ...request,
        ...(captureId === undefined ? {} : { captureId }),
        attachRecording,
      },
      { tabId },
      {
        threadId: draftId,
        expectedUserId: draft.userId,
        expectedWorkspaceId: draft.workspaceId,
        ...(draft.startUrl === undefined ? {} : { startUrl: draft.startUrl }),
      },
    );
  }

  async function clear(tabId: number, draft: StoredRecordingDraft): Promise<void> {
    deps.recordings.discard(tabId);
    if (draft.input.captureId !== undefined) {
      deps.captures.remove(draft.input.captureId);
    }
    await deps.store.clear(tabId);
  }

  async function finish(finished: RecordingFinished): Promise<boolean> {
    const { tabId } = finished;
    const draft = await deps.store.load(tabId);
    if (draft === null) {
      return removed.has(tabId);
    }
    try {
      if (removed.has(tabId) || (await deps.getTab(tabId)) === null) {
        return true;
      }
      let result: MessageResult<ThreadRecord>;
      try {
        result = await post(tabId, draft, finished.reason !== "error" && finished.size > 0);
      } catch (error) {
        result = {
          ok: false,
          error: {
            code: "unknown",
            message: error instanceof Error ? error.message : "Could not post your comment.",
          },
        };
      }
      await deps.sendToTab(
        tabId,
        result.ok
          ? {
              type: "recording.threadCreated",
              draftId: draft.input.draftId,
              thread: result.data,
              withoutVideo: result.data.context?.recording === undefined,
            }
          : {
              type: "recording.threadFailed",
              draftId: draft.input.draftId,
              message: result.error.message,
            },
      );
    } finally {
      await clear(tabId, draft);
    }
    return true;
  }

  return {
    prepare: (tabId) =>
      exclusive(async () => {
        const page = parsePageUrl((await deps.getTab(tabId))?.url ?? "");
        if (page === null || (await deps.getEnabledSite(page.site)) === null) {
          return failure("forbidden");
        }
        const response = await deps.sendToTab(tabId, { type: "recording.commentFirst" });
        return response !== undefined &&
          typeof response === "object" &&
          response !== null &&
          "ok" in response &&
          response.ok === true
          ? success(null)
          : failure("page_unavailable");
      }),
    start: (request) => exclusive(() => deps.recordings.start(request)),
    submit: (tabId, input) =>
      exclusive<RecordingDraftOutcome>(async () => {
        const tab = await deps.getTab(tabId);
        const page = parsePageUrl(tab?.url ?? "");
        const enabled = page === null ? null : await deps.getEnabledSite(page.site);
        if (
          page === null ||
          enabled?.siteId !== input.siteId ||
          parsePageUrl(input.pageUrl)?.site !== page.site
        ) {
          return failure("forbidden");
        }
        const auth = await deps.auth.getState();
        if (!auth.ok) {
          return auth;
        }
        if (auth.data.status !== "signedIn") {
          return failure("unauthorized");
        }
        const screenshot = await snapshot(input);
        const draft: StoredRecordingDraft = {
          version: 1,
          at: Date.now(),
          input,
          userId: auth.data.user.id,
          workspaceId: enabled.workspaceId,
          origin: page.site,
          ...(tab?.url === undefined
            ? {}
            : { startUrl: tab.url.slice(0, RECORDING_START_URL_MAX) }),
          ...(screenshot === undefined ? {} : { screenshot }),
        };
        await deps.store.save(tabId, draft);
        let recording = false;
        try {
          try {
            const streamId = await deps.getMediaStreamId(tabId);
            if (removed.has(tabId)) {
              return failure("page_unavailable");
            }
            const started = await deps.recordings.start({ tabId, streamId });
            if (started.ok) {
              recording = true;
              return success({ state: "recording", draftId: input.draftId });
            }
          } catch {
            if (removed.has(tabId)) {
              return failure("page_unavailable");
            }
          }
          const result = await post(tabId, draft, false);
          return result.ok ? success({ state: "posted", thread: result.data }) : result;
        } finally {
          if (!recording) {
            await clear(tabId, draft);
          }
        }
      }),
    onFinished: (finished) => {
      const existing = finishing.get(finished.tabId);
      if (existing !== undefined) {
        return existing;
      }
      const task = finish(finished).finally(() => finishing.delete(finished.tabId));
      finishing.set(finished.tabId, task);
      return task;
    },
    async onTabRemoved(tabId) {
      removed.add(tabId);
      const draft = await deps.store.load(tabId);
      if (draft !== null) {
        await clear(tabId, draft);
      }
    },
  };
}
