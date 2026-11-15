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
  route: string;
  current: boolean;
  hasRecording: boolean;
}

function excerptOf(thread: ThreadRecord): string {
  const first = thread.comments.find((comment) => !comment.deleted);
  const text = first?.body.replace(/\s+/g, " ").trim() ?? "";
  return text.length > SUMMARY_EXCERPT_LIMIT ? `${text.slice(0, SUMMARY_EXCERPT_LIMIT)}…` : text;
}

function routeOf(pageUrl: string): string {
  return URL.parse(pageUrl)?.pathname ?? "/";
}

export function summarizeThreads(
  threads: readonly ThreadRecord[],
  resolutions: ReadonlyMap<string, Resolution>,
  currentPageUrl: string | null,
): PageThreadSummary[] {
  const groups = new Map<string, ThreadRecord[]>();
  for (const thread of threads) {
    groups.set(thread.pageUrl, [...(groups.get(thread.pageUrl) ?? []), thread]);
  }
  const summaries = [...groups].flatMap(([pageUrl, group]) => {
    const current = pageUrl === currentPageUrl;
    return numberingOrder(group).map((thread, index) => ({
      id: thread.id,
      number: index + 1,
      status: thread.status,
      excerpt: excerptOf(thread),
      authorName: thread.author.displayName,
      replies: Math.max(0, thread.comments.filter((comment) => !comment.deleted).length - 1),
      detached: current && isOrphaned(resolutions, thread.id),
      route: routeOf(pageUrl),
      current,
      hasRecording: thread.context?.recording !== undefined,
    }));
  });
  return summaries.sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      a.route.localeCompare(b.route) ||
      a.number - b.number,
  );
}
