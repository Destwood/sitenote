import { anchorSchema, type Anchor } from "@sitenote/core";
import type { SitenoteClient } from "@sitenote/db";

import { mapDataError } from "../data-errors";
import {
  failure,
  success,
  type DataRequest,
  type ErrorResponse,
  type MessageResult,
} from "../messages";
import type {
  CommentRecord,
  PersonRecord,
  SiteInfo,
  ThreadRecord,
  WorkspaceInfo,
} from "../transport";

const PROFILE_COLUMNS = "user_id, display_name, avatar_url" as const;
const COMMENT_COLUMNS =
  `id, thread_id, author_id, body, edited_at, deleted_at, created_at, author:profiles!comments_author_id_fkey(${PROFILE_COLUMNS})` as const;
const THREAD_SELECT =
  `id, site_id, page_url, anchor, status, created_at, created_by, author:profiles!threads_created_by_fkey(${PROFILE_COLUMNS}), comments(${COMMENT_COLUMNS})` as const;
const UNIQUE_VIOLATION = "23505";

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
  created_at: string;
  created_by: string | null;
  author: ProfileRow | null;
  comments: CommentRow[];
}

export interface EnabledSite {
  siteId: string;
  workspaceId: string;
}

export interface DataServiceDeps {
  client: SitenoteClient;
  getEnabledSite: (origin: string) => Promise<EnabledSite | null>;
}

type Handled<Type extends DataRequest["type"]> = Extract<DataRequest, { type: Type }>;

export interface DataService {
  forOrigin: (request: Handled<"sites.forOrigin">) => Promise<MessageResult<SiteInfo | null>>;
  listThreads: (request: Handled<"threads.list">) => Promise<MessageResult<ThreadRecord[]>>;
  createThread: (request: Handled<"threads.create">) => Promise<MessageResult<ThreadRecord>>;
  setThreadStatus: (request: Handled<"threads.setStatus">) => Promise<MessageResult<ThreadRecord>>;
  createComment: (request: Handled<"comments.create">) => Promise<MessageResult<CommentRecord>>;
  updateComment: (request: Handled<"comments.update">) => Promise<MessageResult<CommentRecord>>;
  deleteComment: (request: Handled<"comments.delete">) => Promise<MessageResult<CommentRecord>>;
  listWorkspaces: () => Promise<MessageResult<WorkspaceInfo[]>>;
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
    comments: row.comments.map(toComment).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export function createDataService(deps: DataServiceDeps): DataService {
  const { client } = deps;

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

    createThread: ({ siteId, pageUrl, anchor, context, body, mentions }) =>
      guarded(async () => {
        const created = await client.rpc("create_thread", {
          p_site_id: siteId,
          p_page_url: pageUrl,
          p_anchor: anchor,
          p_context: context,
          p_body: body,
          p_mentions: mentions,
        });
        return created.error === null ? fetchThread(created.data.id) : fail(created.error);
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
