import type { SitenoteClient } from "@sitenote/db";
import { FunctionsHttpError } from "@supabase/supabase-js";
import * as z from "zod/mini";

export interface JiraFailure {
  ok: false;
  message: string;
  code?: string | undefined;
}

export type JiraOutcome<T> = { ok: true; data: T } | JiraFailure;

export interface JiraLinkResult {
  issueKey: string;
  issueUrl: string;
  linked: boolean;
  linkAdded: boolean;
}

export interface JiraIssueSummary {
  key: string;
  summary: string;
  status: string;
  projectKey: string;
  projectName: string;
  url: string;
}

export interface JiraProject {
  key: string;
  name: string;
}

export interface JiraSearchResult {
  issues: JiraIssueSummary[];
  projects: JiraProject[];
}

export interface JiraSettings {
  workspaceId: string;
  siteUrl: string;
  email: string;
  token?: string | undefined;
}

export interface JiraConnection {
  siteUrl: string;
  email: string;
}

export const JIRA_FAILURE_MESSAGE = "Something went wrong. Try again.";
export const JIRA_DISCONNECT_MESSAGE = "We could not disconnect Jira. Try again.";

const JIRA_ISSUE_KEY = /^[A-Z][A-Z0-9_]+-[0-9]+$/;
const JIRA_ISSUE_KEY_MAX_LENGTH = 64;

const linkResultSchema = z.object({
  issueKey: z.string(),
  issueUrl: z.string(),
  linked: z.boolean(),
  linkAdded: z.boolean(),
});
const searchResultSchema = z.object({
  issues: z.array(
    z.object({
      key: z.string(),
      summary: z.string(),
      status: z.string(),
      projectKey: z.string(),
      projectName: z.string(),
      url: z.string(),
    }),
  ),
  projects: z.array(z.object({ key: z.string(), name: z.string() })),
});
const errorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
const connectionSchema = z.object({
  siteUrl: z.string(),
  email: z.string(),
});

const GENERIC_FAILURE: JiraFailure = { ok: false, message: JIRA_FAILURE_MESSAGE };

async function readFailure(error: unknown): Promise<JiraFailure> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body: unknown = await (error.context as Response).json();
      const parsed = z.safeParse(errorEnvelopeSchema, body);
      if (parsed.success) {
        return { ok: false, message: parsed.data.error.message, code: parsed.data.error.code };
      }
    } catch {
      return GENERIC_FAILURE;
    }
  }
  return GENERIC_FAILURE;
}

async function invoke<T extends z.ZodMiniType>(
  supabase: SitenoteClient,
  name: string,
  body: Record<string, unknown>,
  schema: T,
): Promise<JiraOutcome<z.output<T>>> {
  const result: { data: unknown; error: unknown } = await supabase.functions.invoke(name, { body });
  const { data, error } = result;
  if (error !== null) {
    return readFailure(error);
  }
  const parsed = z.safeParse(schema, data);
  return parsed.success ? { ok: true, data: parsed.data } : GENERIC_FAILURE;
}

export function normalizeIssueKey(input: string): string | null {
  const key = input.trim().toUpperCase();
  return key.length <= JIRA_ISSUE_KEY_MAX_LENGTH && JIRA_ISSUE_KEY.test(key) ? key : null;
}

export async function saveJiraSettings(
  supabase: SitenoteClient,
  settings: JiraSettings,
): Promise<JiraOutcome<null>> {
  const result = await invoke(
    supabase,
    "jira-save-settings",
    { ...settings },
    z.object({ connected: z.boolean() }),
  );
  return result.ok ? { ok: true, data: null } : result;
}

export async function disconnectJira(
  supabase: SitenoteClient,
  workspaceId: string,
): Promise<JiraOutcome<null>> {
  const { error } = await supabase.rpc("jira_disconnect", { p_workspace_id: workspaceId });
  return error === null
    ? { ok: true, data: null }
    : { ok: false, message: JIRA_DISCONNECT_MESSAGE };
}

export function linkJiraIssue(
  supabase: SitenoteClient,
  threadId: string,
  issueKey: string,
): Promise<JiraOutcome<JiraLinkResult>> {
  return invoke(supabase, "jira-link-issue", { threadId, issueKey }, linkResultSchema);
}

export async function searchJiraIssues(
  supabase: SitenoteClient,
  workspaceId: string,
  query: string,
  projectKey?: string,
  includeProjects?: boolean,
): Promise<{ ok: true; issues: JiraIssueSummary[]; projects: JiraProject[] } | JiraFailure> {
  const result = await invoke(
    supabase,
    "jira-search-issues",
    { workspaceId, query, projectKey, includeProjects },
    searchResultSchema,
  );
  return result.ok
    ? { ok: true, issues: result.data.issues, projects: result.data.projects }
    : result;
}

export async function isJiraConfigured(
  supabase: SitenoteClient,
  workspaceId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("jira_configured", { p_workspace_id: workspaceId });
  return error === null && data;
}

export function readJiraConnection(settings: unknown): JiraConnection | null {
  const parsed = z.safeParse(connectionSchema, settings);
  return parsed.success ? parsed.data : null;
}
