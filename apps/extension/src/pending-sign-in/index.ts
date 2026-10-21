import * as z from "zod/mini";

const STORAGE_KEY = "sitenote.pending-sign-in";

export const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

const pendingSchema = z.object({
  email: z.string().check(z.minLength(1)),
  sentAt: z.number(),
});

export type PendingSignIn = z.infer<typeof pendingSchema>;

export function readPendingSignIn(nowMs: number): PendingSignIn | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed = pendingSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return null;
    }
    const age = nowMs - parsed.data.sentAt;
    return age >= 0 && age <= PENDING_MAX_AGE_MS ? parsed.data : null;
  } catch {
    return null;
  }
}

export function savePendingSignIn(pending: PendingSignIn): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    return;
  }
}

export function clearPendingSignIn(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}
