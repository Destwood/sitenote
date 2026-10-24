import { anchorSchema, parseThreadContext, type Anchor } from "@sitenote/core";
import type { CommentRecord, MemberRecord, PersonRecord, ThreadRecord } from "@sitenote/widget";

export const FORMER_MEMBER_NAME = "Former member";
export const DELETED_USER_NAME = "Deleted user";

const PROFILE_COLUMNS = "user_id, display_name, avatar_url" as const;

export const COMMENT_COLUMNS =
  `id, thread_id, author_id, body, mentions, edited_at, deleted_at, created_at, author:profiles!comments_author_id_fkey(${PROFILE_COLUMNS})` as const;

export const THREAD_SELECT =
  `id, site_id, page_url, anchor, status, context, screenshot_path, clickup_task_url, created_at, created_by, author:profiles!threads_created_by_fkey(${PROFILE_COLUMNS}), comments(${COMMENT_COLUMNS})` as const;

export const MEMBER_SELECT =
  `role, profile:profiles!members_user_id_fkey(${PROFILE_COLUMNS})` as const;

export interface ProfileRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface CommentRow {
  id: string;
  thread_id: string;
  author_id: string | null;
  body: string;
  mentions: string[];
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  author: ProfileRow | null;
}

export interface ThreadRow {
  id: string;
  site_id: string;
  page_url: string;
  anchor: unknown;
  status: ThreadRecord["status"];
  context: unknown;
  screenshot_path: string | null;
  clickup_task_url: string | null;
  created_at: string;
  created_by: string | null;
  author: ProfileRow | null;
  comments: CommentRow[];
}

export interface MemberRow {
  role: MemberRecord["role"];
  profile: ProfileRow | null;
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

function toAnchor(value: unknown): Anchor | null {
  const parsed = anchorSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toPerson(profile: ProfileRow | null, userId: string | null): PersonRecord {
  if (profile !== null) {
    return {
      id: profile.user_id,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
    };
  }
  return userId === null
    ? { id: "", displayName: DELETED_USER_NAME, avatarUrl: null }
    : { id: userId, displayName: FORMER_MEMBER_NAME, avatarUrl: null };
}

export function toComment(row: CommentRow): CommentRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    author: toPerson(row.author, row.author_id),
    body: row.body,
    createdAt: toIso(row.created_at),
    editedAt: row.edited_at === null ? null : toIso(row.edited_at),
    deleted: row.deleted_at !== null,
    mentions: row.mentions,
  };
}

export function toThread(row: ThreadRow): ThreadRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    pageUrl: row.page_url,
    status: row.status,
    anchor: toAnchor(row.anchor),
    author: toPerson(row.author, row.created_by),
    createdAt: toIso(row.created_at),
    context: parseThreadContext(row.context),
    hasScreenshot: row.screenshot_path !== null,
    clickUpTaskUrl: row.clickup_task_url,
    comments: row.comments.map(toComment).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export function toMember(row: MemberRow): MemberRecord | null {
  if (row.profile === null) {
    return null;
  }
  return {
    id: row.profile.user_id,
    displayName: row.profile.display_name,
    avatarUrl: row.profile.avatar_url,
    role: row.role,
  };
}
