import {
  commentModeToggleSchema,
  commentOnElementSchema,
  pageOpenSidebarSchema,
  pageOpenThreadSchema,
  pageThreadsRequestSchema,
  recordingReadySchema,
  recordingStateSchema,
  recordingCommentFirstSchema,
  recordingThreadCreatedSchema,
  recordingThreadFailedSchema,
  type CommentModeState,
  type CommentOnElementState,
  type PageOpenSidebarState,
  type PageOpenThreadState,
  type RecordingStatus,
} from "../messages";
import {
  success,
  type MessageResult,
  type PageThreadSummary,
  type ThreadRecord,
} from "@sitenote/widget";
import type { StepRecorder, StepRecorderOptions } from "../step-recorder";

export interface ToggleSender {
  id?: string | undefined;
  tab?: unknown;
}

export interface RecordingControls {
  show: (startedAt: number) => void;
  hide: () => void;
  attach: () => MessageResult<null>;
  commentFirst?: () => MessageResult<null>;
  threadCreated?: (thread: ThreadRecord, withoutVideo: boolean) => void;
  threadFailed?: (message: string) => void;
}

export type StepControls = Pick<StepRecorder, "start" | "stop">;

export interface ToggleListenerDeps {
  extensionId: string;
  toggle: () => MessageResult<CommentModeState>;
  commentOnElement: () => MessageResult<CommentOnElementState>;
  listThreads: () => MessageResult<PageThreadSummary[]>;
  openThread: (threadId: string) => MessageResult<PageOpenThreadState>;
  openSidebar: () => MessageResult<PageOpenSidebarState>;
  recording: RecordingControls;
  steps: StepControls;
}

export type ToggleListener = (
  message: unknown,
  sender: ToggleSender,
  sendResponse: (
    response:
      | MessageResult<CommentModeState>
      | MessageResult<CommentOnElementState>
      | MessageResult<PageThreadSummary[]>
      | MessageResult<PageOpenThreadState>
      | MessageResult<PageOpenSidebarState>
      | MessageResult<null>,
  ) => void,
) => void;

export function createToggleListener(deps: ToggleListenerDeps): ToggleListener {
  return (message, sender, sendResponse) => {
    if (sender.id !== deps.extensionId || sender.tab !== undefined) {
      return;
    }
    const open = pageOpenThreadSchema.safeParse(message);
    const recording = recordingStateSchema.safeParse(message);
    const created = recordingThreadCreatedSchema.safeParse(message);
    const failed = recordingThreadFailedSchema.safeParse(message);
    if (commentModeToggleSchema.safeParse(message).success) {
      sendResponse(deps.toggle());
    } else if (commentOnElementSchema.safeParse(message).success) {
      sendResponse(deps.commentOnElement());
    } else if (pageThreadsRequestSchema.safeParse(message).success) {
      sendResponse(deps.listThreads());
    } else if (open.success) {
      sendResponse(deps.openThread(open.data.threadId));
    } else if (pageOpenSidebarSchema.safeParse(message).success) {
      sendResponse(deps.openSidebar());
    } else if (recording.success) {
      const { recording: active, startedAt } = recording.data;
      if (active && startedAt !== undefined) {
        deps.recording.show(startedAt);
        deps.steps.start(startedAt, { announceNavigation: false });
      } else {
        deps.recording.hide();
        deps.steps.stop();
      }
    } else if (recordingReadySchema.safeParse(message).success) {
      sendResponse(deps.recording.attach());
    } else if (recordingCommentFirstSchema.safeParse(message).success) {
      const response = deps.recording.commentFirst?.();
      if (response !== undefined) {
        sendResponse(response);
      }
    } else if (created.success) {
      deps.recording.threadCreated?.(
        created.data.thread,
        created.data.withoutVideo ?? created.data.thread.context?.recording === undefined,
      );
      sendResponse(success(null));
    } else if (failed.success) {
      deps.recording.threadFailed?.(failed.data.message);
      sendResponse(success(null));
    }
  };
}

export interface RecordingRestoreDeps {
  show: (startedAt: number) => void;
  startSteps: (startedAt: number, options: StepRecorderOptions) => void;
  now: () => number;
}

export async function restoreRecording(
  readStatus: () => Promise<MessageResult<RecordingStatus>>,
  deps: RecordingRestoreDeps,
): Promise<void> {
  const status = await readStatus();
  if (status.ok && status.data.state === "recording") {
    const startedAt = status.data.startedAt ?? deps.now();
    deps.show(startedAt);
    deps.startSteps(startedAt, { announceNavigation: true });
  }
}
