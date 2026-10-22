import * as z from "zod/mini";

const uuidSchema = z.guid();

export function parseUuid(value: unknown): string | null {
  const result = uuidSchema.safeParse(value);
  return result.success ? result.data : null;
}
