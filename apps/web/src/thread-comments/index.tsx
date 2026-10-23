import { splitMentions, type MentionCandidate } from "@sitenote/core";
import type { Tables } from "@sitenote/db";

import { formatUtcDateTime } from "../format-utc";
import { FORMER_MEMBER_LABEL } from "../thread-table";
import { memberNames, type WorkspaceMember } from "../workspace-members";

export const DELETED_COMMENT_TEXT = "Comment deleted";
export const NO_COMMENTS_TEXT = "No comments.";

export type CommentRow = Pick<
  Tables<"comments">,
  "id" | "author_id" | "body" | "mentions" | "created_at" | "edited_at" | "deleted_at"
>;

export interface CommentView {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  mentions: MentionCandidate[];
}

export function toCommentViews(
  rows: readonly CommentRow[],
  members: readonly WorkspaceMember[],
): CommentView[] {
  const names = memberNames(members);
  return rows.map((row) => ({
    id: row.id,
    authorName:
      row.author_id === null
        ? FORMER_MEMBER_LABEL
        : (names.get(row.author_id) ?? FORMER_MEMBER_LABEL),
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deleted: row.deleted_at !== null,
    mentions: row.mentions.flatMap((id) => {
      const displayName = names.get(id);
      return displayName === undefined ? [] : [{ id, displayName }];
    }),
  }));
}

interface ThreadCommentsProps {
  comments: readonly CommentView[];
}

export function ThreadComments({ comments }: ThreadCommentsProps) {
  if (comments.length === 0) {
    return <p className="text-neutral-600">{NO_COMMENTS_TEXT}</p>;
  }

  return (
    <ol className="flex flex-col divide-y divide-neutral-200">
      {comments.map((comment) => (
        <li key={comment.id} className="flex flex-col gap-1 py-3">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-neutral-600">
            <span className="font-semibold text-neutral-900">{comment.authorName}</span>
            <time dateTime={comment.createdAt}>{formatUtcDateTime(comment.createdAt)}</time>
            {comment.editedAt !== null && !comment.deleted ? <span>edited</span> : null}
          </p>
          {comment.deleted ? (
            <p className="text-neutral-600 italic">{DELETED_COMMENT_TEXT}</p>
          ) : (
            <p className="break-words whitespace-pre-wrap">
              {splitMentions(comment.body, comment.mentions).map((segment, index) =>
                segment.kind === "mention" ? (
                  <span
                    key={index}
                    data-mention={segment.userId}
                    className="rounded-sm bg-blue-100 px-0.5 font-medium text-blue-900"
                  >
                    {segment.text}
                  </span>
                ) : (
                  <span key={index}>{segment.text}</span>
                ),
              )}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
