import type { Resolution } from "../anchor-target";
import type { ThreadRecord, ThreadStatus } from "../transport";
import { isOrphaned, numberingOrder } from "../view-model";

export const SUMMARY_EXCERPT_LIMIT = 80;

export interface PageThreadSummary {
  id: string;
  number: number;
  status: ThreadStatus;
  excerpt: string;
  authorName: string;
  replies: number;
  detached: boolean;
}

function excerptOf(thread: ThreadRecord): string {
  const first = thread.comments.find((comment) => !comment.deleted);
  const text = first?.body.replace(/\s+/g, " ").trim() ?? "";
  return text.length > SUMMARY_EXCERPT_LIMIT ? `${text.slice(0, SUMMARY_EXCERPT_LIMIT)}…` : text;
}

export function summarizeThreads(
  threads: readonly ThreadRecord[],
  resolutions: ReadonlyMap<string, Resolution>,
): PageThreadSummary[] {
  return numberingOrder(threads).map((thread, index) => ({
    id: thread.id,
    number: index + 1,
    status: thread.status,
    excerpt: excerptOf(thread),
    authorName: thread.author.displayName,
    replies: Math.max(0, thread.comments.filter((comment) => !comment.deleted).length - 1),
    detached: isOrphaned(resolutions, thread.id),
  }));
}
