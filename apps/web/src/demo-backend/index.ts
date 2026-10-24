import { fitThreadContext, withoutConsoleErrors } from "@sitenote/core";
import type { SitenoteClient } from "@sitenote/db";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import {
  createContextCollector,
  failure,
  success,
  type ErrorResponse,
  type MessageResult,
  type ThreadRecord,
  type WidgetBackend,
  type WidgetSubscription,
  type WidgetSubscriptionHandle,
  type WidgetSubscriptionHandlers,
} from "@sitenote/widget";
import * as z from "zod/mini";

import { DEMO_WORKSPACE_ID } from "../demo-client";
import { mapDemoError } from "../demo-errors";
import {
  COMMENT_COLUMNS,
  MEMBER_SELECT,
  THREAD_SELECT,
  toComment,
  toMember,
  toThread,
  type MemberRow,
  type ThreadRow,
} from "../demo-records";
import { SCREENSHOT_BUCKET, type DemoScreenshots } from "../demo-screenshot";

export const SIGNED_URL_TTL_SECONDS = 3600;
export const PREFERENCE_KEY_PREFIX = "sitenote-demo:show-resolved:";

const changeSchema = z.object({
  new: z.optional(z.record(z.string(), z.unknown())),
  old: z.optional(z.record(z.string(), z.unknown())),
});

export interface DemoBackendDeps {
  client: SitenoteClient;
  win: Window;
  doc: Document;
  screenshots: DemoScreenshots;
}

function fail(error: unknown): ErrorResponse {
  return failure(mapDemoError(error));
}

function changedId(raw: unknown, key: string): string | null {
  const parsed = z.safeParse(changeSchema, raw);
  if (!parsed.success) {
    return null;
  }
  for (const row of [parsed.data.new, parsed.data.old]) {
    const value = row?.[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
}

function readShowResolved(win: Window, siteId: string): boolean {
  try {
    return win.localStorage.getItem(PREFERENCE_KEY_PREFIX + siteId) === "true";
  } catch {
    return false;
  }
}

function writeShowResolved(win: Window, siteId: string, showResolved: boolean): void {
  try {
    win.localStorage.setItem(PREFERENCE_KEY_PREFIX + siteId, String(showResolved));
  } catch {
    return;
  }
}

function extensionFor(type: string): string {
  return type === "image/png" ? "png" : "webp";
}

async function guarded<Data>(
  client: SitenoteClient,
  run: (userId: string) => Promise<MessageResult<Data>>,
): Promise<MessageResult<Data>> {
  try {
    const session = await client.auth.getSession();
    const userId = session.data.session?.user.id;
    return userId === undefined ? failure("unauthorized") : await run(userId);
  } catch (error) {
    return fail(error);
  }
}

async function fetchThread(
  client: SitenoteClient,
  threadId: string,
): Promise<MessageResult<ThreadRecord>> {
  const result = await client.from("threads").select(THREAD_SELECT).eq("id", threadId).single();
  return result.error === null ? success(toThread(result.data)) : fail(result.error);
}

export function createDemoBackend(deps: DemoBackendDeps): WidgetBackend {
  const { client, win, doc } = deps;
  let pending: { id: string; blob: Blob } | null = null;
  const collectContext = createContextCollector({
    win,
    doc,
    requestErrors: () => Promise.resolve([]),
  });

  async function attachScreenshot(
    captureId: string | undefined,
    threadId: string,
  ): Promise<MessageResult<string | null>> {
    if (captureId === undefined || pending?.id !== captureId) {
      return success(null);
    }
    const { blob } = pending;
    pending = null;
    const path = `${DEMO_WORKSPACE_ID}/${threadId}.${extensionFor(blob.type)}`;
    const uploaded = await client.storage
      .from(SCREENSHOT_BUCKET)
      .upload(path, blob, { contentType: blob.type, upsert: false });
    return uploaded.error === null ? success(path) : fail(uploaded.error);
  }

  return {
    getSiteInfo: (origin) =>
      guarded(client, async (userId) => {
        const [membership, site] = await Promise.all([
          client
            .from("members")
            .select("role, workspaces(name)")
            .eq("workspace_id", DEMO_WORKSPACE_ID)
            .eq("user_id", userId)
            .maybeSingle(),
          client
            .from("sites")
            .select("id")
            .eq("workspace_id", DEMO_WORKSPACE_ID)
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
          siteId: site.data.id,
          workspaceId: DEMO_WORKSPACE_ID,
          workspaceName: membership.data.workspaces.name,
          role: membership.data.role,
          userId,
          captureErrors: false,
        });
      }),

    listThreads: (siteId, pageUrl) =>
      guarded(client, async () => {
        const result = await client
          .from("threads")
          .select(THREAD_SELECT)
          .eq("site_id", siteId)
          .eq("page_url", pageUrl)
          .order("created_at", { ascending: true });
        if (result.error !== null) {
          return fail(result.error);
        }
        const rows: ThreadRow[] = result.data;
        return success(rows.map(toThread));
      }),

    createThread: (input) =>
      guarded(client, async () => {
        const threadId = crypto.randomUUID();
        const screenshot = await attachScreenshot(input.captureId, threadId);
        if (!screenshot.ok) {
          return screenshot;
        }
        const created = await client.rpc("create_thread", {
          p_id: threadId,
          p_site_id: input.siteId,
          p_page_url: input.pageUrl,
          p_anchor: input.anchor,
          p_context: withoutConsoleErrors(fitThreadContext(input.context)),
          p_body: input.body,
          p_mentions: input.mentions,
          ...(screenshot.data === null ? {} : { p_screenshot_path: screenshot.data }),
        });
        if (created.error !== null) {
          return fail(created.error);
        }
        return fetchThread(client, threadId);
      }),

    setStatus: (threadId, status) =>
      guarded(client, async () => {
        const result = await client
          .from("threads")
          .update({ status })
          .eq("id", threadId)
          .select(THREAD_SELECT)
          .single();
        return result.error === null ? success(toThread(result.data)) : fail(result.error);
      }),

    createComment: ({ threadId, body, mentions }) =>
      guarded(client, async (userId) => {
        const result = await client
          .from("comments")
          .insert({
            thread_id: threadId,
            workspace_id: DEMO_WORKSPACE_ID,
            author_id: userId,
            body,
            mentions,
          })
          .select(COMMENT_COLUMNS)
          .single();
        return result.error === null ? success(toComment(result.data)) : fail(result.error);
      }),

    updateComment: ({ commentId, body }) =>
      guarded(client, async () => {
        const result = await client
          .from("comments")
          .update({ body })
          .eq("id", commentId)
          .select(COMMENT_COLUMNS)
          .single();
        return result.error === null ? success(toComment(result.data)) : fail(result.error);
      }),

    deleteComment: (commentId) =>
      guarded(client, async () => {
        const result = await client
          .from("comments")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", commentId)
          .select(COMMENT_COLUMNS)
          .single();
        return result.error === null ? success(toComment(result.data)) : fail(result.error);
      }),

    listMembers: (workspaceId) =>
      guarded(client, async () => {
        const result = await client
          .from("members")
          .select(MEMBER_SELECT)
          .eq("workspace_id", workspaceId);
        if (result.error !== null) {
          return fail(result.error);
        }
        const rows: MemberRow[] = result.data;
        return success(
          rows
            .flatMap((row) => {
              const member = toMember(row);
              return member === null ? [] : [member];
            })
            .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id)),
        );
      }),

    subscribe: (subscription: WidgetSubscription, handlers: WidgetSubscriptionHandlers) => {
      const channel = client
        .channel(`sitenote-demo:site:${subscription.siteId}:${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "threads",
            filter: `site_id=eq.${subscription.siteId}`,
          },
          (raw) => {
            const threadId = changedId(raw, "id");
            if (threadId !== null) {
              handlers.onEvent({ type: "threads.changed", threadId });
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "comments",
            filter: `workspace_id=eq.${subscription.workspaceId}`,
          },
          (raw) => {
            const threadId = changedId(raw, "thread_id");
            if (threadId !== null) {
              handlers.onEvent({ type: "comments.changed", threadId });
            }
          },
        )
        .subscribe((status) => {
          if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            handlers.onSubscribed();
          } else {
            handlers.onDisconnected();
          }
        });
      const handle: WidgetSubscriptionHandle = {
        update: () => undefined,
        close: () => {
          void client.removeChannel(channel);
        },
      };
      return handle;
    },

    captureScreenshot: async (rect, devicePixelRatio) => {
      try {
        const capture = await deps.screenshots.capture(rect, devicePixelRatio);
        const id = crypto.randomUUID();
        pending = { id, blob: capture.blob };
        return success({ captureId: id, width: capture.width, height: capture.height });
      } catch {
        return failure("capture_failed");
      }
    },

    getScreenshotUrl: (threadId) =>
      guarded(client, async () => {
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
        return signed.error === null ? success(signed.data.signedUrl) : fail(signed.error);
      }),

    collectContext,

    getPreference: (siteId) =>
      Promise.resolve(success({ showResolved: readShowResolved(win, siteId) })),

    setPreference: (siteId, showResolved) => {
      writeShowResolved(win, siteId, showResolved);
      return Promise.resolve(success(null));
    },

    getClickUpStatus: () => Promise.resolve(success(false)),

    createClickUpTask: () => Promise.resolve(failure("not_configured")),
  };
}
