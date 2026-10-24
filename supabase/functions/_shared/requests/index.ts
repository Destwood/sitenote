import * as z from "zod/mini";

import { ApiError } from "../api/index.ts";

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

export type ClickUpSettings = z.output<typeof clickUpSettings>;
export type CreateTaskBody = z.output<typeof createTaskBody>;
export type SaveSettingsBody = z.output<typeof saveSettingsBody>;
export type HierarchyBody = z.output<typeof hierarchyBody>;
export type InsertWebhookBody = z.output<typeof insertWebhookBody>;

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
