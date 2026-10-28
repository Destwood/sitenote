import {
  commentModeToggleSchema,
  commentOnElementSchema,
  pageOpenSidebarSchema,
  pageOpenThreadSchema,
  pageThreadsRequestSchema,
  type CommentModeState,
  type CommentOnElementState,
  type PageOpenSidebarState,
  type PageOpenThreadState,
} from "../messages";
import { type MessageResult, type PageThreadSummary } from "@sitenote/widget";

export interface ToggleSender {
  id?: string | undefined;
  tab?: unknown;
}

export interface ToggleListenerDeps {
  extensionId: string;
  toggle: () => MessageResult<CommentModeState>;
  commentOnElement: () => MessageResult<CommentOnElementState>;
  listThreads: () => MessageResult<PageThreadSummary[]>;
  openThread: (threadId: string) => MessageResult<PageOpenThreadState>;
  openSidebar: () => MessageResult<PageOpenSidebarState>;
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
      | MessageResult<PageOpenSidebarState>,
  ) => void,
) => void;

export function createToggleListener(deps: ToggleListenerDeps): ToggleListener {
  return (message, sender, sendResponse) => {
    if (sender.id !== deps.extensionId || sender.tab !== undefined) {
      return;
    }
    const open = pageOpenThreadSchema.safeParse(message);
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
    }
  };
}
