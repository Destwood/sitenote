import type { Anchor } from "@sitenote/core";
import type { CommentView, PersonView, ThreadView } from "@sitenote/ui";

import type { Resolution } from "../anchor-target";
import type { CommentRecord, MemberRecord, SiteInfo, ThreadRecord } from "../transport";

export const ANCHOR_LABEL_LIMIT = 80;
export const UNKNOWN_ANCHOR_LABEL = "Unknown location";

export function anchorLabel(anchor: Anchor | null): string {
  if (anchor === null) {
    return UNKNOWN_ANCHOR_LABEL;
  }
  if (anchor.kind === "element") {
    return anchor.selectors.css.slice(0, ANCHOR_LABEL_LIMIT);
  }
  const quote = anchor.quote.exact.replace(/\s+/g, " ");
  const shown =
    quote.length > ANCHOR_LABEL_LIMIT ? `${quote.slice(0, ANCHOR_LABEL_LIMIT)}…` : quote;
  return `“${shown}”`;
}

export function canChangeStatus(site: SiteInfo, thread: ThreadRecord): boolean {
  return site.role !== "guest" || thread.author.id === site.userId;
}

export function buildMentionCandidates(
  members: readonly MemberRecord[],
  userId: string,
): PersonView[] {
  return members
    .filter((member) => member.id !== userId)
    .map(({ id, displayName, avatarUrl }) => ({ id, displayName, avatarUrl }));
}

function toCommentView(
  comment: CommentRecord,
  userId: string,
  names: ReadonlyMap<string, string>,
): CommentView {
  return {
    id: comment.id,
    author: comment.author,
    body: comment.body,
    createdAt: comment.createdAt,
    editedAt: comment.editedAt,
    deleted: comment.deleted,
    canEdit: !comment.deleted && comment.author.id === userId,
    mentions: comment.deleted
      ? []
      : comment.mentions.flatMap((id) => {
          const displayName = names.get(id);
          return displayName === undefined ? [] : [{ id, displayName }];
        }),
  };
}

export function numberingOrder(threads: readonly ThreadRecord[]): ThreadRecord[] {
  return [...threads].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export function isOrphaned(
  resolutions: ReadonlyMap<string, Resolution>,
  threadId: string,
): boolean {
  return resolutions.get(threadId)?.status !== "resolved";
}

export function buildThreadViews(
  threads: readonly ThreadRecord[],
  resolutions: ReadonlyMap<string, Resolution>,
  userId: string,
  members: readonly MemberRecord[] = [],
): ThreadView[] {
  const names = new Map(members.map((member) => [member.id, member.displayName]));
  return numberingOrder(threads).map((thread, index) => ({
    id: thread.id,
    status: thread.status,
    number: index + 1,
    author: thread.author,
    createdAt: thread.createdAt,
    comments: thread.comments.map((comment) => toCommentView(comment, userId, names)),
    orphaned: isOrphaned(resolutions, thread.id),
    anchorLabel: anchorLabel(thread.anchor),
    context: thread.context,
    hasScreenshot: thread.hasScreenshot,
  }));
}

export function upsertThread(
  threads: readonly ThreadRecord[],
  record: ThreadRecord,
): ThreadRecord[] {
  return threads.some((thread) => thread.id === record.id)
    ? threads.map((thread) => (thread.id === record.id ? record : thread))
    : [...threads, record];
}

export function upsertComment(
  threads: readonly ThreadRecord[],
  comment: CommentRecord,
): ThreadRecord[] {
  return threads.map((thread) => {
    if (thread.id !== comment.threadId) {
      return thread;
    }
    const exists = thread.comments.some((existing) => existing.id === comment.id);
    return {
      ...thread,
      comments: exists
        ? thread.comments.map((existing) => (existing.id === comment.id ? comment : existing))
        : [...thread.comments, comment],
    };
  });
}
