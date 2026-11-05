import * as z from "zod/mini";

import { ApiError } from "../api/index.ts";
import { JIRA_ISSUE_KEY, JIRA_ISSUE_KEY_MAX, normalizeJiraSiteUrl } from "../jira-issue/index.ts";

const CLICKUP_ID = z.string().check(z.regex(/^\d{1,20}$/));
const NAME = z.string().check(z.minLength(1), z.maxLength(200));
const TOKEN = z.string().check(z.minLength(1), z.maxLength(256));

export const createTaskBody = z.object({
  threadId: z.uuid(),
});

const clickUpSettingsFields = {
  teamId: CLICKUP_ID,
  teamName: NAME,
  spaceId: CLICKUP_ID,
  spaceName: NAME,
  listId: CLICKUP_ID,
  listName: NAME,
};

export const clickUpSettings = z.object(clickUpSettingsFields);

export function parseStoredSettings(value: unknown): ClickUpSettings {
  const result = z.safeParse(clickUpSettings, value);
  if (!result.success) {
    throw new ApiError("not_configured", "The ClickUp settings of this workspace are incomplete");
  }
  return result.data;
}

export const saveSettingsBody = z.object({
  workspaceId: z.uuid(),
  token: z.optional(TOKEN),
  ...clickUpSettingsFields,
});

export const hierarchyBody = z.object({
  workspaceId: z.uuid(),
  token: z.optional(TOKEN),
  teamId: z.optional(CLICKUP_ID),
  spaceId: z.optional(CLICKUP_ID),
});

export const insertWebhookBody = z.object({
  type: z.literal("INSERT"),
  table: z.literal("notifications"),
  record: z.object({
    id: z.uuid(),
  }),
});

const JIRA_EMAIL = z.string().check(z.minLength(3), z.maxLength(254), z.regex(/^[^\s@]+@[^\s@]+$/));
const JIRA_KEY = z
  .string()
  .check(z.minLength(1), z.maxLength(JIRA_ISSUE_KEY_MAX), z.regex(JIRA_ISSUE_KEY));

const storedJiraSettings = z.object({
  siteUrl: z.string(),
  email: JIRA_EMAIL,
});

export function parseJiraSettings(value: unknown): JiraSettings {
  const result = z.safeParse(storedJiraSettings, value);
  const siteUrl = result.success ? normalizeJiraSiteUrl(result.data.siteUrl) : null;
  if (!result.success || siteUrl === null) {
    throw new ApiError("not_configured", "The Jira settings of this workspace are incomplete");
  }
  return { siteUrl, email: result.data.email };
}

export const saveJiraSettingsBody = z.object({
  workspaceId: z.uuid(),
  siteUrl: z.string().check(z.minLength(1), z.maxLength(200)),
  email: JIRA_EMAIL,
  token: z.optional(TOKEN),
});

export const linkIssueBody = z.object({
  threadId: z.uuid(),
  issueKey: JIRA_KEY,
});

export type ClickUpSettings = z.output<typeof clickUpSettings>;
export type CreateTaskBody = z.output<typeof createTaskBody>;
export type SaveSettingsBody = z.output<typeof saveSettingsBody>;
export type HierarchyBody = z.output<typeof hierarchyBody>;
export type InsertWebhookBody = z.output<typeof insertWebhookBody>;
export type JiraSettings = z.output<typeof storedJiraSettings>;
export type SaveJiraSettingsBody = z.output<typeof saveJiraSettingsBody>;
export type LinkIssueBody = z.output<typeof linkIssueBody>;

export function parseRequest<T extends z.ZodMiniType>(schema: T, value: unknown): z.output<T> {
  const result = z.safeParse(schema, value);
  if (!result.success) {
    throw new ApiError("validation", "The request body is invalid");
  }
  return result.data;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("validation", "The request body must be JSON");
  }
}
