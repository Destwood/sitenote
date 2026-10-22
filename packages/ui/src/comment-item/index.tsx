import { splitMentions } from "@sitenote/core";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "../avatar";
import { Composer } from "../composer";
import { DANGER_BUTTON, SECONDARY_BUTTON, TEXT_BUTTON } from "../control-classes";
import { formatAbsoluteTime, formatRelativeTime } from "../relative-time";
import type { CommentView } from "../types";

export const DELETED_PLACEHOLDER = "Comment deleted";
export const DELETE_FAILED_MESSAGE = "Could not delete the comment. Try again.";

type Mode = "view" | "edit" | "confirm";
type ReturnTarget = "edit" | "delete";

export interface CommentItemProps {
  comment: CommentView;
  now: number;
  onEdit: (body: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function CommentItem({ comment, now, onEdit, onDelete }: CommentItemProps) {
  const [mode, setMode] = useState<Mode>("view");
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const itemRef = useRef<HTMLLIElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const returnTarget = useRef<ReturnTarget | null>(null);

  useEffect(() => {
    if (mode === "confirm") {
      keepButtonRef.current?.focus();
      return;
    }
    if (mode === "view" && returnTarget.current !== null) {
      const button = returnTarget.current === "edit" ? editButtonRef : deleteButtonRef;
      button.current?.focus();
      returnTarget.current = null;
    }
  }, [mode]);

  function leave(from: ReturnTarget) {
    returnTarget.current = from;
    setDeleteFailed(false);
    setMode("view");
  }

  async function handleEdit(body: string) {
    await onEdit(body);
    leave("edit");
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await onDelete();
      setMode("view");
      itemRef.current?.focus();
    } catch {
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  }

  const absolute = formatAbsoluteTime(comment.createdAt);
  const actionable = comment.canEdit && !comment.deleted;

  return (
    <li ref={itemRef} tabIndex={-1} className="flex gap-2 py-2 outline-none">
      <Avatar person={comment.author} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-neutral-600">
          <span className="text-sm font-semibold text-neutral-900">
            {comment.author.displayName}
          </span>
          <time dateTime={comment.createdAt} title={absolute === "" ? undefined : absolute}>
            {formatRelativeTime(comment.createdAt, now)}
          </time>
          {comment.editedAt !== null && !comment.deleted ? <span>edited</span> : null}
        </p>
        {comment.deleted ? (
          <p className="mt-0.5 text-neutral-600 italic">{DELETED_PLACEHOLDER}</p>
        ) : mode === "edit" ? (
          <div className="mt-1">
            <Composer
              label="Edit comment"
              submitLabel="Save"
              initialValue={comment.body}
              autoFocus
              onSubmit={({ body }) => handleEdit(body)}
              onCancel={() => {
                leave("edit");
              }}
            />
          </div>
        ) : (
          <p className="mt-0.5 break-words whitespace-pre-wrap">
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
                segment.text
              ),
            )}
          </p>
        )}
        {actionable && mode === "view" ? (
          <div className="mt-1 flex gap-3">
            <button
              ref={editButtonRef}
              type="button"
              onClick={() => {
                setMode("edit");
              }}
              className={TEXT_BUTTON}
            >
              Edit
            </button>
            <button
              ref={deleteButtonRef}
              type="button"
              onClick={() => {
                setMode("confirm");
              }}
              className={TEXT_BUTTON}
            >
              Delete
            </button>
          </div>
        ) : null}
        {actionable && mode === "confirm" ? (
          <div
            role="group"
            aria-label="Confirm deletion"
            className="mt-2 flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-2"
          >
            <p className="text-xs text-red-900">Delete this comment? This cannot be undone.</p>
            {deleteFailed ? (
              <p role="alert" className="text-xs font-semibold text-red-900">
                {DELETE_FAILED_MESSAGE}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                ref={keepButtonRef}
                type="button"
                disabled={deleting}
                onClick={() => {
                  leave("delete");
                }}
                className={SECONDARY_BUTTON}
              >
                Keep
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDelete()}
                className={DANGER_BUTTON}
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </li>
  );
}
