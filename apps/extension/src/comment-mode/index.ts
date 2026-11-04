import {
  commentModeToggleSchema,
  commentOnElementSchema,
  pageOpenSidebarSchema,
  pageOpenThreadSchema,
  pageThreadsRequestSchema,
  recordingReadySchema,
  recordingStateSchema,
  type CommentModeState,
  type CommentOnElementState,
  type PageOpenSidebarState,
  type PageOpenThreadState,
  type RecordingStatus,
} from "../messages";
import { type MessageResult, type PageThreadSummary } from "@sitenote/widget";

export interface ToggleSender {
  id?: string | undefined;
  tab?: unknown;
}

export interface RecordingControls {
  show: (startedAt: number) => void;
  hide: () => void;
  attach: () => MessageResult<null>;
}

export interface ToggleListenerDeps {
  extensionId: string;
  toggle: () => MessageResult<CommentModeState>;
  commentOnElement: () => MessageResult<CommentOnElementState>;
  listThreads: () => MessageResult<PageThreadSummary[]>;
  openThread: (threadId: string) => MessageResult<PageOpenThreadState>;
  openSidebar: () => MessageResult<PageOpenSidebarState>;
  recording: RecordingControls;
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
      } else {
        deps.recording.hide();
      }
    } else if (recordingReadySchema.safeParse(message).success) {
      sendResponse(deps.recording.attach());
    }
  };
}

export async function restoreRecording(
  readStatus: () => Promise<MessageResult<RecordingStatus>>,
  show: (startedAt: number) => void,
): Promise<void> {
  const status = await readStatus();
  if (status.ok && status.data.state === "recording" && status.data.startedAt !== undefined) {
    show(status.data.startedAt);
  }
}
