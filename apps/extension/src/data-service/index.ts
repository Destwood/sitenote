import {
  anchorSchema,
  fitThreadContext,
  parsePageUrl,
  parseThreadContext,
  withoutConsoleErrors,
  type Anchor,
  type ThreadContext,
} from "@sitenote/core";
import type { SitenoteClient } from "@sitenote/db";
import { FunctionsHttpError } from "@supabase/supabase-js";
import * as z from "zod/mini";

import { mapDataError } from "../data-errors";
import {
  clickUpTaskResultSchema,
  failure,
  isErrorCode,
  success,
  type ClickUpTaskResult,
  type DataRequest,
  type ErrorResponse,
  type MessageResult,
} from "../messages";
import { SCREENSHOT_BUCKET, type ThreadScreenshots } from "../screenshot-upload";
import type {
  CommentRecord,
  MemberRecord,
  NotificationList,
  NotificationRecord,
  PersonRecord,
  SiteInfo,
  ThreadRecord,
  WorkspaceInfo,
} from "../transport";

const PROFILE_COLUMNS = "user_id, display_name, avatar_url" as const;
const COMMENT_COLUMNS =
  `id, thread_id, author_id, body, mentions, edited_at, deleted_at, created_at, author:profiles!comments_author_id_fkey(${PROFILE_COLUMNS})` as const;
const THREAD_SELECT =
  `id, site_id, page_url, anchor, status, context, screenshot_path, clickup_task_url, created_at, created_by, author:profiles!threads_created_by_fkey(${PROFILE_COLUMNS}), comments(${COMMENT_COLUMNS})` as const;
const MEMBER_SELECT = `role, profile:profiles!members_user_id_fkey(${PROFILE_COLUMNS})` as const;
const NOTIFICATION_SELECT =
  "id, kind, read_at, created_at, thread_id, thread:threads(page_url, status), comment:comments(body, deleted_at, author:profiles!comments_author_id_fkey(display_name))" as const;
const UNIQUE_VIOLATION = "23505";
const functionErrorSchema = z.object({ error: z.object({ code: z.string() }) });

export const MEMBERS_CACHE_TTL_MS = 60_000;
export const SIGNED_URL_TTL_SECONDS = 3600;
export const SIGNED_URL_REFRESH_MARGIN_MS = 5 * 60 * 1000;
export const EXCERPT_LENGTH = 140;
export const FORMER_MEMBER_NAME = "Former member";

interface ProfileRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface CommentRow {
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

interface MembershipRow {
  role: SiteInfo["role"];
  workspaces: { id: string; name: string } | null;
}

interface ThreadRow {
  id: string;
  site_id: string;
  page_url: string;
  anchor: unknown;
  status: "open" | "resolved";
  context: unknown;
  screenshot_path: string | null;
  clickup_task_url: string | null;
  created_at: string;
  created_by: string | null;
  author: ProfileRow | null;
  comments: CommentRow[];
}

interface MemberRow {
  role: MemberRecord["role"];
  profile: ProfileRow | null;
}

interface NotificationRow {
  id: string;
  kind: NotificationRecord["kind"];
  thread_id: string;
  read_at: string | null;
  created_at: string;
  thread: { page_url: string; status: NotificationRecord["threadStatus"] } | null;
  comment: {
    body: string;
    deleted_at: string | null;
    author: { display_name: string } | null;
  } | null;
}

interface CachedMembers {
  userId: string;
  at: number;
  members: MemberRecord[];
}

interface CachedUrl {
  userId: string;
  url: string;
  expiresAt: number;
}

export interface EnabledSite {
  siteId: string;
  workspaceId: string;
  captureErrors: boolean;
}

export interface DataServiceDeps {
  client: SitenoteClient;
  getEnabledSite: (origin: string) => Promise<EnabledSite | null>;
  screenshots: ThreadScreenshots;
  now?: () => number;
}

type Handled<Type extends DataRequest["type"]> = Extract<DataRequest, { type: Type }>;

export interface DataService {
  forOrigin: (request: Handled<"sites.forOrigin">) => Promise<MessageResult<SiteInfo | null>>;
  listThreads: (request: Handled<"threads.list">) => Promise<MessageResult<ThreadRecord[]>>;
  createThread: (request: Handled<"threads.create">) => Promise<MessageResult<ThreadRecord>>;
  screenshotUrl: (
    request: Handled<"threads.screenshotUrl">,
  ) => Promise<MessageResult<string | null>>;
  setThreadStatus: (request: Handled<"threads.setStatus">) => Promise<MessageResult<ThreadRecord>>;
  clickUpStatus: (request: Handled<"clickup.status">) => Promise<MessageResult<boolean>>;
  clickUpCreateTask: (
    request: Handled<"clickup.createTask">,
  ) => Promise<MessageResult<ClickUpTaskResult>>;
  createComment: (request: Handled<"comments.create">) => Promise<MessageResult<CommentRecord>>;
  updateComment: (request: Handled<"comments.update">) => Promise<MessageResult<CommentRecord>>;
  deleteComment: (request: Handled<"comments.delete">) => Promise<MessageResult<CommentRecord>>;
  listWorkspaces: () => Promise<MessageResult<WorkspaceInfo[]>>;
  listMembers: (request: Handled<"members.list">) => Promise<MessageResult<MemberRecord[]>>;
  listNotifications: (
    request: Handled<"notifications.list">,
  ) => Promise<MessageResult<NotificationList>>;
  markNotificationsRead: (
    request: Handled<"notifications.markRead">,
  ) => Promise<MessageResult<null>>;
  markAllNotificationsRead: () => Promise<MessageResult<null>>;
  countUnreadNotifications: () => Promise<MessageResult<number>>;
  ensureSite: (workspaceId: string, origin: string) => Promise<MessageResult<string>>;
  findThreadPage: (threadId: string) => Promise<string | null>;
  hasSession: () => Promise<boolean>;
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

function toAnchor(value: unknown): Anchor | null {
  const parsed = anchorSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toContext(value: unknown): ThreadContext | null {
  return parseThreadContext(value);
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
    ? { id: "", displayName: "Deleted user", avatarUrl: null }
    : { id: userId, displayName: "Former member", avatarUrl: null };
}

function toComment(row: CommentRow): CommentRecord {
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

export function toExcerpt(body: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  const characters = Array.from(text);
  return characters.length > EXCERPT_LENGTH
    ? `${characters.slice(0, EXCERPT_LENGTH).join("")}…`
    : text;
}

function toNotification(row: NotificationRow): NotificationRecord | null {
  const page = row.thread === null ? undefined : parsePageUrl(row.thread.page_url)?.page;
  if (row.thread === null || page === undefined || row.comment === null) {
    return null;
  }
  return {
    id: row.id,
    kind: row.kind,
    threadId: row.thread_id,
    pageUrl: page,
    threadStatus: row.thread.status,
    excerpt: row.comment.deleted_at === null ? toExcerpt(row.comment.body) : "",
    actorName: row.comment.author?.display_name ?? FORMER_MEMBER_NAME,
    createdAt: toIso(row.created_at),
    read: row.read_at !== null,
  };
}

function toThread(row: ThreadRow): ThreadRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    pageUrl: row.page_url,
    status: row.status,
    anchor: toAnchor(row.anchor),
    author: toPerson(row.author, row.created_by),
    createdAt: toIso(row.created_at),
    context: toContext(row.context),
    hasScreenshot: row.screenshot_path !== null,
    clickUpTaskUrl: row.clickup_task_url,
    comments: row.comments.map(toComment).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export function createDataService(deps: DataServiceDeps): DataService {
  const { client } = deps;
  const now = deps.now ?? Date.now;
  const memberCache = new Map<string, CachedMembers>();
  const urlCache = new Map<string, CachedUrl>();

  async function currentUserId(): Promise<string | null> {
    try {
      const { data } = await client.auth.getSession();
      return data.session?.user.id ?? null;
    } catch {
      return null;
    }
  }

  async function guarded<Data>(
    run: (userId: string) => Promise<MessageResult<Data>>,
  ): Promise<MessageResult<Data>> {
    try {
      const userId = await currentUserId();
      return userId === null ? failure("unauthorized") : await run(userId);
    } catch (error) {
      return failure(mapDataError(error));
    }
  }

  function fail(error: unknown): ErrorResponse {
    return failure(mapDataError(error));
  }

  async function readJsonBody(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function functionFailure(error: unknown): Promise<ErrorResponse> {
    if (!(error instanceof FunctionsHttpError)) {
      return fail(error);
    }
    const context: unknown = error.context;
    const body = context instanceof Response ? await readJsonBody(context) : null;
    const parsed = z.safeParse(functionErrorSchema, body);
    return parsed.success && isErrorCode(parsed.data.error.code)
      ? failure(parsed.data.error.code)
      : failure("unknown");
  }

  async function fetchThread(threadId: string): Promise<MessageResult<ThreadRecord>> {
    const result = await client.from("threads").select(THREAD_SELECT).eq("id", threadId).single();
    return result.error === null ? success(toThread(result.data)) : fail(result.error);
  }

  return {
    forOrigin: ({ origin }) =>
      guarded(async (userId) => {
        const enabled = await deps.getEnabledSite(origin);
        if (enabled === null) {
          return success(null);
        }
        const [membership, site] = await Promise.all([
          client
            .from("members")
            .select("role, workspaces(name)")
            .eq("workspace_id", enabled.workspaceId)
            .eq("user_id", userId)
            .maybeSingle(),
          client
            .from("sites")
            .select("id")
            .eq("id", enabled.siteId)
            .eq("workspace_id", enabled.workspaceId)
            .eq("origin", origin)
            .maybeSingle(),
        ]);
        if (membership.error !== null) {
          return fail(membership.error);
        }
        if (site.error !== null) {
          return fail(site.error);
        }
        if (membership.data?.workspaces == null || site.data === null) {
          return success(null);
        }
        return success({
          siteId: enabled.siteId,
          workspaceId: enabled.workspaceId,
          workspaceName: membership.data.workspaces.name,
          role: membership.data.role,
          userId,
          captureErrors: enabled.captureErrors,
        });
      }),

    listThreads: ({ siteId, pageUrl }) =>
      guarded(async () => {
        const result = await client
          .from("threads")
          .select(THREAD_SELECT)
          .eq("site_id", siteId)
          .eq("page_url", pageUrl)
          .order("created_at", { ascending: true });
        return result.error === null ? success(result.data.map(toThread)) : fail(result.error);
      }),

    createThread: ({ siteId, pageUrl, anchor, context, captureId, body, mentions }) =>
      guarded(async () => {
        const origin = parsePageUrl(pageUrl)?.site;
        const enabled = origin === undefined ? null : await deps.getEnabledSite(origin);
        if (enabled?.siteId !== siteId) {
          return failure("forbidden");
        }
        const fitted = fitThreadContext(context);
        const attachment =
          captureId === undefined
            ? null
            : await deps.screenshots.attach(captureId, enabled.workspaceId);
        const created = await client.rpc("create_thread", {
          p_site_id: siteId,
          p_page_url: pageUrl,
          p_anchor: anchor,
          p_context: enabled.captureErrors ? fitted : withoutConsoleErrors(fitted),
          p_body: body,
          p_mentions: mentions,
          ...(attachment === null ? {} : { p_id: attachment.threadId }),
          ...(attachment?.path == null ? {} : { p_screenshot_path: attachment.path }),
        });
        if (created.error !== null) {
          return fail(created.error);
        }
        if (captureId !== undefined) {
          deps.screenshots.discard(captureId);
        }
        return fetchThread(created.data.id);
      }),

    screenshotUrl: ({ threadId }) =>
      guarded(async (userId) => {
        const cached = urlCache.get(threadId);
        if (cached?.userId === userId && cached.expiresAt - now() > SIGNED_URL_REFRESH_MARGIN_MS) {
          return success(cached.url);
        }
        const row = await client
          .from("threads")
          .select("screenshot_path")
          .eq("id", threadId)
          .maybeSingle();
        if (row.error !== null) {
          return fail(row.error);
        }
        if (row.data === null) {
          return failure("not_found");
        }
        if (row.data.screenshot_path === null) {
          return success(null);
        }
        const signed = await client.storage
          .from(SCREENSHOT_BUCKET)
          .createSignedUrl(row.data.screenshot_path, SIGNED_URL_TTL_SECONDS);
        if (signed.error !== null) {
          return fail(signed.error);
        }
        for (const [key, entry] of urlCache) {
          if (entry.expiresAt <= now()) {
            urlCache.delete(key);
          }
        }
        urlCache.set(threadId, {
          userId,
          url: signed.data.signedUrl,
          expiresAt: now() + SIGNED_URL_TTL_SECONDS * 1000,
        });
        return success(signed.data.signedUrl);
      }),

    clickUpStatus: ({ workspaceId }) =>
      guarded(async () => {
        const result = await client.rpc("clickup_configured", { p_workspace_id: workspaceId });
        return result.error === null ? success(result.data) : fail(result.error);
      }),

    clickUpCreateTask: ({ threadId }) =>
      guarded(async () => {
        const result = await client.functions.invoke("clickup-create-task", { body: { threadId } });
        if (result.error !== null) {
          return functionFailure(result.error);
        }
        const parsed = z.safeParse(clickUpTaskResultSchema, result.data);
        return parsed.success ? success(parsed.data) : failure("unknown");
      }),

    setThreadStatus: ({ threadId, status }) =>
      guarded(async () => {
        const result = await client
          .from("threads")
          .update({ status })
          .eq("id", threadId)
          .select(THREAD_SELECT)
          .single();
        return result.error === null ? success(toThread(result.data)) : fail(result.error);
      }),

    createComment: ({ threadId, body, mentions }) =>
      guarded(async (userId) => {
        const thread = await client
          .from("threads")
          .select("workspace_id")
          .eq("id", threadId)
          .single();
        if (thread.error !== null) {
          return fail(thread.error);
        }
        const result = await client
          .from("comments")
          .insert({
            thread_id: threadId,
            workspace_id: thread.data.workspace_id,
            author_id: userId,
            body,
            mentions,
          })
          .select(COMMENT_COLUMNS)
          .single();
        return result.error === null ? success(toComment(result.data)) : fail(result.error);
      }),

    updateComment: ({ commentId, body }) =>
      guarded(async () => {
        const result = await client
          .from("comments")
          .update({ body })
          .eq("id", commentId)
          .select(COMMENT_COLUMNS)
          .single();
        return result.error === null ? success(toComment(result.data)) : fail(result.error);
      }),

    deleteComment: ({ commentId }) =>
      guarded(async () => {
        const result = await client
          .from("comments")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", commentId)
          .select(COMMENT_COLUMNS)
          .single();
        return result.error === null ? success(toComment(result.data)) : fail(result.error);
      }),

    listWorkspaces: () =>
      guarded(async (userId) => {
        const result = await client
          .from("members")
          .select("role, workspaces(id, name)")
          .eq("user_id", userId)
          .order("created_at", { ascending: true });
        if (result.error !== null) {
          return fail(result.error);
        }
        const rows: MembershipRow[] = result.data;
        const workspaces: WorkspaceInfo[] = [];
        for (const row of rows) {
          if (row.workspaces !== null) {
            workspaces.push({ id: row.workspaces.id, name: row.workspaces.name, role: row.role });
          }
        }
        return success(workspaces);
      }),

    listMembers: ({ workspaceId }) =>
      guarded(async (userId) => {
        const cached = memberCache.get(workspaceId);
        if (cached?.userId === userId && now() - cached.at < MEMBERS_CACHE_TTL_MS) {
          return success(cached.members);
        }
        const result = await client
          .from("members")
          .select(MEMBER_SELECT)
          .eq("workspace_id", workspaceId);
        if (result.error !== null) {
          return fail(result.error);
        }
        const rows: MemberRow[] = result.data;
        const members: MemberRecord[] = [];
        for (const row of rows) {
          if (row.profile !== null) {
            members.push({
              id: row.profile.user_id,
              displayName: row.profile.display_name,
              avatarUrl: row.profile.avatar_url,
              role: row.role,
            });
          }
        }
        members.sort(
          (a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id),
        );
        memberCache.set(workspaceId, { userId, at: now(), members });
        return success(members);
      }),

    listNotifications: ({ limit }) =>
      guarded(async (userId) => {
        const [list, unread] = await Promise.all([
          client
            .from("notifications")
            .select(NOTIFICATION_SELECT)
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit),
          client
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .is("read_at", null),
        ]);
        if (list.error !== null) {
          return fail(list.error);
        }
        if (unread.error !== null) {
          return fail(unread.error);
        }
        const rows: NotificationRow[] = list.data;
        const items: NotificationRecord[] = [];
        for (const row of rows) {
          const item = toNotification(row);
          if (item !== null) {
            items.push(item);
          }
        }
        return success({ items, unread: unread.count ?? 0 });
      }),

    markNotificationsRead: ({ ids }) =>
      guarded(async (userId) => {
        const result = await client
          .from("notifications")
          .update({ read_at: new Date(now()).toISOString() })
          .eq("user_id", userId)
          .in("id", ids)
          .is("read_at", null);
        return result.error === null ? success(null) : fail(result.error);
      }),

    markAllNotificationsRead: () =>
      guarded(async (userId) => {
        const result = await client
          .from("notifications")
          .update({ read_at: new Date(now()).toISOString() })
          .eq("user_id", userId)
          .is("read_at", null);
        return result.error === null ? success(null) : fail(result.error);
      }),

    countUnreadNotifications: () =>
      guarded(async (userId) => {
        const result = await client
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .is("read_at", null);
        return result.error === null ? success(result.count ?? 0) : fail(result.error);
      }),

    ensureSite: (workspaceId, origin) =>
      guarded(async () => {
        const lookup = () =>
          client
            .from("sites")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("origin", origin)
            .maybeSingle();
        const existing = await lookup();
        if (existing.error !== null) {
          return fail(existing.error);
        }
        if (existing.data !== null) {
          return success(existing.data.id);
        }
        const inserted = await client
          .from("sites")
          .insert({ workspace_id: workspaceId, origin })
          .select("id")
          .single();
        if (inserted.error === null) {
          return success(inserted.data.id);
        }
        if (inserted.error.code !== UNIQUE_VIOLATION) {
          return fail(inserted.error);
        }
        const raced = await lookup();
        return raced.error === null && raced.data !== null
          ? success(raced.data.id)
          : fail(raced.error ?? inserted.error);
      }),

    findThreadPage: async (threadId) => {
      try {
        const result = await client
          .from("threads")
          .select("page_url")
          .eq("id", threadId)
          .maybeSingle();
        return result.error === null ? (result.data?.page_url ?? null) : null;
      } catch {
        return null;
      }
    },

    hasSession: async () => (await currentUserId()) !== null,
  };
}
