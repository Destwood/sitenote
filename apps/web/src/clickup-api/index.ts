import type { SitenoteClient } from "@sitenote/db";
import { FunctionsHttpError } from "@supabase/supabase-js";
import * as z from "zod/mini";

export type ClickUpOutcome<T> = { ok: true; data: T } | { ok: false; message: string };

export interface ClickUpItem {
  id: string;
  name: string;
}

export interface ClickUpHierarchy {
  teams: ClickUpItem[];
  spaces?: ClickUpItem[] | undefined;
  lists?: ClickUpItem[] | undefined;
}

export interface ClickUpSettings {
  workspaceId: string;
  token?: string | undefined;
  teamId: string;
  teamName: string;
  spaceId: string;
  spaceName: string;
  listId: string;
  listName: string;
}

export interface ClickUpConnection {
  teamName: string;
  spaceName: string;
  listName: string;
}

export interface ClickUpTaskResult {
  taskId: string;
  taskUrl: string;
  created: boolean;
  screenshotAttached: boolean;
}

export const CLICKUP_FAILURE_MESSAGE = "Something went wrong. Try again.";
export const CLICKUP_DISCONNECT_MESSAGE = "We could not disconnect ClickUp. Try again.";

const itemSchema = z.object({ id: z.string(), name: z.string() });
const hierarchySchema = z.object({
  teams: z.array(itemSchema),
  spaces: z.optional(z.array(itemSchema)),
  lists: z.optional(z.array(itemSchema)),
});
const taskSchema = z.object({
  taskId: z.string(),
  taskUrl: z.string(),
  created: z.boolean(),
  screenshotAttached: z.boolean(),
});
const errorEnvelopeSchema = z.object({ error: z.object({ message: z.string() }) });
const connectionSchema = z.object({
  teamName: z.string(),
  spaceName: z.string(),
  listName: z.string(),
});

async function readFailure(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body: unknown = await (error.context as Response).json();
      const parsed = z.safeParse(errorEnvelopeSchema, body);
      if (parsed.success) {
        return parsed.data.error.message;
      }
    } catch {
      return CLICKUP_FAILURE_MESSAGE;
    }
  }
  return CLICKUP_FAILURE_MESSAGE;
}

async function invoke<T extends z.ZodMiniType>(
  supabase: SitenoteClient,
  name: string,
  body: Record<string, unknown>,
  schema: T,
): Promise<ClickUpOutcome<z.output<T>>> {
  const result: { data: unknown; error: unknown } = await supabase.functions.invoke(name, { body });
  const { data, error } = result;
  if (error !== null) {
    return { ok: false, message: await readFailure(error) };
  }
  const parsed = z.safeParse(schema, data);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, message: CLICKUP_FAILURE_MESSAGE };
}

export function loadClickUpHierarchy(
  supabase: SitenoteClient,
  input: {
    workspaceId: string;
    token?: string | undefined;
    teamId?: string | undefined;
    spaceId?: string | undefined;
  },
): Promise<ClickUpOutcome<ClickUpHierarchy>> {
  return invoke(supabase, "clickup-hierarchy", input, hierarchySchema);
}

export async function saveClickUpSettings(
  supabase: SitenoteClient,
  settings: ClickUpSettings,
): Promise<ClickUpOutcome<null>> {
  const result = await invoke(
    supabase,
    "clickup-save-settings",
    { ...settings },
    z.object({ connected: z.boolean() }),
  );
  return result.ok ? { ok: true, data: null } : result;
}

export async function disconnectClickUp(
  supabase: SitenoteClient,
  workspaceId: string,
): Promise<ClickUpOutcome<null>> {
  const { error } = await supabase.rpc("clickup_disconnect", { p_workspace_id: workspaceId });
  return error === null
    ? { ok: true, data: null }
    : { ok: false, message: CLICKUP_DISCONNECT_MESSAGE };
}

export function createClickUpTask(
  supabase: SitenoteClient,
  threadId: string,
): Promise<ClickUpOutcome<ClickUpTaskResult>> {
  return invoke(supabase, "clickup-create-task", { threadId }, taskSchema);
}

export async function isClickUpConfigured(
  supabase: SitenoteClient,
  workspaceId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("clickup_configured", { p_workspace_id: workspaceId });
  return error === null && data;
}

export function readClickUpConnection(settings: unknown): ClickUpConnection | null {
  const parsed = z.safeParse(connectionSchema, settings);
  return parsed.success ? parsed.data : null;
}
