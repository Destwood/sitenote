import * as z from "zod/mini";

export const DISPLAY_NAME_MAX_LENGTH = 80;

const displayNameSchema = z
  .string()
  .check(z.trim(), z.minLength(1), z.maxLength(DISPLAY_NAME_MAX_LENGTH));

export function parseDisplayName(value: unknown): string | null {
  const result = displayNameSchema.safeParse(value);
  return result.success ? result.data : null;
}
