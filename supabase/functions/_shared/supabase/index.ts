import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as z from "zod/mini";

import { ApiError } from "../api/index.ts";
import { requireEnv, type EnvMap } from "../runtime/index.ts";

export type Role = "owner" | "member" | "guest";

const roleRow = z.nullable(z.object({ role: z.enum(["owner", "member", "guest"]) }));
const threadRow = z.nullable(
  z.object({
    id: z.string(),
    workspace_id: z.string(),
    page_url: z.string(),
    context: z.unknown(),
    screenshot_path: z.nullable(z.string()),
    clickup_task_id: z.nullable(z.string()),
    clickup_task_url: z.nullable(z.string()),
  }),
);
const commentRow = z.nullable(z.object({ body: z.string() }));
const integrationRow = z.nullable(
  z.object({ secret_id: z.nullable(z.string()), settings: z.unknown() }),
);
const profileRow = z.nullable(
  z.object({ email: z.nullable(z.string()), display_name: z.nullable(z.string()) }),
);
const notificationRow = z.nullable(
  z.object({
    id: z.string(),
    user_id: z.string(),
    thread_id: z.string(),
    comment_id: z.string(),
    kind: z.enum(["reply", "mention"]),
  }),
);

export interface ThreadRecord {
  id: string;
  workspace_id: string;
  page_url: string;
  context: unknown;
  screenshot_path: string | null;
  clickup_task_id: string | null;
  clickup_task_url: string | null;
}

export interface IntegrationRecord {
  secretId: string | null;
  settings: unknown;
}

export interface NotificationRecord {
  id: string;
  user_id: string;
  thread_id: string;
  comment_id: string;
  kind: "reply" | "mention";
}

function databaseError(error: { message: string }): Error {
  return new Error(error.message);
}

export function bearerToken(request: Request): string {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") ?? "");
  if (match?.[1] === undefined) {
    throw new ApiError("unauthorized", "Sign in to continue");
  }
  return match[1];
}

export function userClient(env: EnvMap, token: string, fetchImpl: typeof fetch): SupabaseClient {
  return createClient(requireEnv(env, "SUPABASE_URL"), requireEnv(env, "SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: fetchImpl },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function serviceClient(env: EnvMap, fetchImpl: typeof fetch): SupabaseClient {
  return createClient(
    requireEnv(env, "SUPABASE_URL"),
    requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY"),
    {
      global: { fetch: fetchImpl },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}

export function clickUpApiBase(env: EnvMap): string {
  const base = env.CLICKUP_API_BASE ?? "https://api.clickup.com";
  try {
    new URL(base);
  } catch {
    throw new ApiError("not_configured", "CLICKUP_API_BASE is not a valid url");
  }
  return base;
}

export async function authenticate(client: SupabaseClient, token: string): Promise<string> {
  const { data, error } = await client.auth.getUser(token);
  if (error !== null || data.user === null) {
    throw new ApiError("unauthorized", "Sign in to continue");
  }
  return data.user.id;
}

export async function roleIn(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<Role | null> {
  const { data, error } = await client
    .from("members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error !== null) {
    throw databaseError(error);
  }
  const row = z.safeParse(roleRow, data);
  return row.success && row.data !== null ? row.data.role : null;
}

export async function requireOwner(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const role = await roleIn(client, workspaceId, userId);
  if (role === null) {
    throw new ApiError("not_found", "The workspace was not found");
  }
  if (role !== "owner") {
    throw new ApiError("forbidden", "Only the owner can manage the ClickUp integration");
  }
}

export async function loadThread(client: SupabaseClient, threadId: string): Promise<ThreadRecord> {
  const { data, error } = await client
    .from("threads")
    .select(
      "id, workspace_id, page_url, context, screenshot_path, clickup_task_id, clickup_task_url",
    )
    .eq("id", threadId)
    .maybeSingle();
  if (error !== null) {
    throw databaseError(error);
  }
  const row = z.safeParse(threadRow, data);
  if (!row.success || row.data === null) {
    throw new ApiError("not_found", "The comment was not found");
  }
  return row.data;
}

export async function firstCommentBody(
  client: SupabaseClient,
  threadId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("comments")
    .select("body")
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error !== null) {
    throw databaseError(error);
  }
  const row = z.safeParse(commentRow, data);
  return row.success && row.data !== null ? row.data.body : null;
}

export async function loadIntegration(
  client: SupabaseClient,
  workspaceId: string,
): Promise<IntegrationRecord | null> {
  const { data, error } = await client
    .from("integrations")
    .select("secret_id, settings")
    .eq("workspace_id", workspaceId)
    .eq("provider", "clickup")
    .maybeSingle();
  if (error !== null) {
    throw databaseError(error);
  }
  const row = z.safeParse(integrationRow, data);
  if (!row.success || row.data === null) {
    return null;
  }
  return { secretId: row.data.secret_id, settings: row.data.settings };
}

export async function readToken(client: SupabaseClient, secretId: string): Promise<string | null> {
  const { data, error } = await client.rpc("integration_secret_read", { p_secret_id: secretId });
  if (error !== null) {
    throw databaseError(error);
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

export async function storeToken(
  client: SupabaseClient,
  workspaceId: string,
  token: string,
  secretId: string | null,
): Promise<string> {
  const { data, error } = await client.rpc("integration_secret_upsert", {
    p_value: token,
    p_workspace_id: workspaceId,
    p_provider: "clickup",
    p_secret_id: secretId ?? undefined,
  });
  if (error !== null) {
    throw databaseError(error);
  }
  if (typeof data !== "string") {
    throw new Error("integration_secret_upsert returned no secret id");
  }
  return data;
}

export async function loadNotification(
  client: SupabaseClient,
  notificationId: string,
): Promise<NotificationRecord | null> {
  const { data, error } = await client
    .from("notifications")
    .select("id, user_id, thread_id, comment_id, kind")
    .eq("id", notificationId)
    .maybeSingle();
  if (error !== null) {
    throw databaseError(error);
  }
  const row = z.safeParse(notificationRow, data);
  return row.success ? row.data : null;
}

export async function loadRecipient(
  client: SupabaseClient,
  userId: string,
): Promise<{ email: string | null; displayName: string | null } | null> {
  const { data, error } = await client
    .from("profiles")
    .select("email, display_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error !== null) {
    throw databaseError(error);
  }
  const row = z.safeParse(profileRow, data);
  if (!row.success || row.data === null) {
    return null;
  }
  return { email: row.data.email, displayName: row.data.display_name };
}

export async function commentForNotification(
  client: SupabaseClient,
  commentId: string,
): Promise<{ body: string; authorId: string | null; deleted: boolean } | null> {
  const { data, error } = await client
    .from("comments")
    .select("body, author_id, deleted_at")
    .eq("id", commentId)
    .maybeSingle();
  if (error !== null) {
    throw databaseError(error);
  }
  const row = z.safeParse(
    z.nullable(
      z.object({
        body: z.string(),
        author_id: z.nullable(z.string()),
        deleted_at: z.nullable(z.string()),
      }),
    ),
    data,
  );
  if (!row.success || row.data === null) {
    return null;
  }
  return {
    body: row.data.body,
    authorId: row.data.author_id,
    deleted: row.data.deleted_at !== null,
  };
}

export async function loadPageUrl(
  client: SupabaseClient,
  threadId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("threads")
    .select("page_url")
    .eq("id", threadId)
    .maybeSingle();
  if (error !== null) {
    throw databaseError(error);
  }
  const row = z.safeParse(z.nullable(z.object({ page_url: z.string() })), data);
  return row.success && row.data !== null ? row.data.page_url : null;
}
