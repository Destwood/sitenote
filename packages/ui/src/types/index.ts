import type { MentionCandidate, ThreadContext } from "@sitenote/core";

export interface PersonView {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CommentView {
  id: string;
  author: PersonView;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  canEdit: boolean;
  mentions: readonly MentionCandidate[];
}

export type ThreadStatus = "open" | "resolved";

export interface ThreadView {
  id: string;
  status: ThreadStatus;
  number: number;
  author: PersonView;
  createdAt: string;
  comments: CommentView[];
  orphaned: boolean;
  anchorLabel: string;
  context: ThreadContext | null;
  hasScreenshot: boolean;
}

export interface SiteThreadItem {
  id: string;
  number: number;
  status: ThreadStatus;
  authorName: string;
  excerpt: string;
  replies: number;
  route: string;
  hasSteps: boolean;
}

export type ScreenshotState =
  { status: "loading" } | { status: "ready"; url: string } | { status: "unavailable" };
