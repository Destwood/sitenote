import * as z from "zod/mini";

export const WORKSPACE_NAME_MAX_LENGTH = 80;

const workspaceNameSchema = z
  .string()
  .check(z.trim(), z.minLength(1), z.maxLength(WORKSPACE_NAME_MAX_LENGTH));

export function parseWorkspaceName(value: unknown): string | null {
  const result = workspaceNameSchema.safeParse(value);
  return result.success ? result.data : null;
}
