export const REFRESH_ALARM_NAME = "sitenote-auth-refresh";
export const REFRESH_MARGIN_MS = 60_000;
export const RETRY_DELAY_MS = 60_000;

export type RefreshOutcome =
  | { status: "active"; expiresAt: number | undefined }
  | { status: "retry" }
  | { status: "signedOut" };

export function planRefresh(outcome: RefreshOutcome, nowMs: number): number | null {
  switch (outcome.status) {
    case "signedOut":
      return null;
    case "retry":
      return nowMs + RETRY_DELAY_MS;
    case "active":
      return outcome.expiresAt === undefined
        ? nowMs + RETRY_DELAY_MS
        : Math.max(outcome.expiresAt * 1000 - REFRESH_MARGIN_MS, nowMs + RETRY_DELAY_MS);
  }
}
