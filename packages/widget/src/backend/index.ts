import type { Anchor, ThreadContext } from "@sitenote/core";

import type {
  CapturedScreenshot,
  CaptureRect,
  ClickUpTaskResult,
  CommentRecord,
  MemberRecord,
  Preferences,
  SiteInfo,
  ThreadRecord,
  ThreadStatus,
} from "../transport";
import type { MessageResult } from "../result";

export type WidgetEvent =
  | { type: "threads.changed"; threadId: string }
  | { type: "comments.changed"; threadId: string }
  | { type: "site.disabled" };

export interface WidgetSubscription {
  siteId: string;
  workspaceId: string;
  getPageUrl: () => string;
}

export interface WidgetSubscriptionHandlers {
  onEvent: (event: WidgetEvent) => void;
  onSubscribed: () => void;
  onDisconnected: () => void;
}

export interface WidgetSubscriptionHandle {
  update: (pageUrl: string) => void;
  close: () => void;
}

export interface CreateThreadInput {
  siteId: string;
  pageUrl: string;
  anchor: Anchor;
  context: ThreadContext;
  captureId?: string;
  body: string;
  mentions: string[];
}

export interface CreateCommentInput {
  threadId: string;
  body: string;
  mentions: string[];
}

export interface UpdateCommentInput {
  commentId: string;
  body: string;
}

export interface WidgetBackend {
  getSiteInfo: (origin: string) => Promise<MessageResult<SiteInfo | null>>;
  listThreads: (siteId: string, pageUrl: string) => Promise<MessageResult<ThreadRecord[]>>;
  createThread: (input: CreateThreadInput) => Promise<MessageResult<ThreadRecord>>;
  setStatus: (threadId: string, status: ThreadStatus) => Promise<MessageResult<ThreadRecord>>;
  createComment: (input: CreateCommentInput) => Promise<MessageResult<CommentRecord>>;
  updateComment: (input: UpdateCommentInput) => Promise<MessageResult<CommentRecord>>;
  deleteComment: (commentId: string) => Promise<MessageResult<CommentRecord>>;
  listMembers: (workspaceId: string) => Promise<MessageResult<MemberRecord[]>>;
  subscribe: (
    subscription: WidgetSubscription,
    handlers: WidgetSubscriptionHandlers,
  ) => WidgetSubscriptionHandle;
  captureScreenshot: (
    rect: CaptureRect,
    devicePixelRatio: number,
  ) => Promise<MessageResult<CapturedScreenshot>>;
  getScreenshotUrl: (threadId: string) => Promise<MessageResult<string | null>>;
  collectContext: () => Promise<ThreadContext>;
  getPreference: (siteId: string) => Promise<MessageResult<Preferences>>;
  setPreference: (siteId: string, showResolved: boolean) => Promise<MessageResult<null>>;
  getClickUpStatus: (workspaceId: string) => Promise<MessageResult<boolean>>;
  createClickUpTask: (threadId: string) => Promise<MessageResult<ClickUpTaskResult>>;
}
