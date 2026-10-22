import { useId, type KeyboardEvent } from "react";

import { FOCUS_RING, ICON_BUTTON, TEXT_BUTTON } from "../control-classes";
import { useNow } from "../now";
import { formatRelativeTime } from "../relative-time";
import type { ThreadView } from "../types";
import { Z_INDEX } from "../z-index";

export const SIDEBAR_WIDTH = 320;
export const ORPHAN_NOTE =
  "The element these comments were attached to changed, so they could not be placed on the page.";
export const EMPTY_MESSAGE = "No comments on this page yet.";

export interface SidebarProps {
  threads: ThreadView[];
  activeThreadId?: string | null;
  showResolved: boolean;
  onShowResolvedChange: (value: boolean) => void;
  onSelectThread: (threadId: string) => void;
  onClose: () => void;
}

interface ThreadListItemProps {
  thread: ThreadView;
  active: boolean;
  now: number;
  showAnchor: boolean;
  onSelect: () => void;
}

function previewOf(thread: ThreadView): string {
  const first = thread.comments.find((comment) => !comment.deleted);
  return first === undefined ? "Comment deleted" : first.body;
}

function ThreadListItem({ thread, active, now, showAnchor, onSelect }: ThreadListItemProps) {
  const last = thread.comments.at(-1);
  const count = thread.comments.length;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={`flex w-full gap-2 rounded-md px-2 py-2 text-left hover:bg-neutral-100 ${active ? "bg-blue-50" : ""} ${FOCUS_RING}`}
      >
        <span
          aria-hidden="true"
          className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${thread.status === "resolved" ? "bg-neutral-600" : "bg-blue-700"}`}
        >
          {thread.number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-neutral-600">
            <span className="sr-only">Thread {thread.number}, </span>
            {thread.status === "resolved" ? "Resolved · " : null}
            {thread.author.displayName}
            {last === undefined ? null : ` · ${formatRelativeTime(last.createdAt, now)}`}
          </span>
          <span className="line-clamp-2 block break-words">{previewOf(thread)}</span>
          {showAnchor ? (
            <span className="mt-0.5 block truncate text-xs text-neutral-600">
              {thread.anchorLabel}
            </span>
          ) : null}
          <span className="mt-0.5 block text-xs text-neutral-600">
            {count} {count === 1 ? "comment" : "comments"}
          </span>
        </span>
      </button>
    </li>
  );
}

export function Sidebar({
  threads,
  activeThreadId = null,
  showResolved,
  onShowResolvedChange,
  onSelectThread,
  onClose,
}: SidebarProps) {
  const now = useNow();
  const titleId = useId();
  const resolvedListId = useId();

  const placed = threads.filter((thread) => !thread.orphaned);
  const open = placed.filter((thread) => thread.status === "open");
  const resolved = placed.filter((thread) => thread.status === "resolved");
  const orphaned = threads.filter((thread) => thread.orphaned);

  const summary = [
    `${String(open.length)} open`,
    `${String(resolved.length)} resolved`,
    ...(orphaned.length > 0 ? [`${String(orphaned.length)} orphaned`] : []),
  ].join(" · ");

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.stopPropagation();
      onClose();
    }
  }

  function renderItem(thread: ThreadView, showAnchor: boolean) {
    return (
      <ThreadListItem
        key={thread.id}
        thread={thread}
        active={thread.id === activeThreadId}
        now={now}
        showAnchor={showAnchor}
        onSelect={() => {
          onSelectThread(thread.id);
        }}
      />
    );
  }

  return (
    <aside
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
      style={{ width: SIDEBAR_WIDTH, zIndex: Z_INDEX.sidebar }}
      className="fixed inset-y-0 right-0 flex max-w-full flex-col border-l border-neutral-200 bg-white font-sans text-sm text-neutral-900 shadow-xl"
    >
      <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-sm font-semibold">
            Comments
          </h2>
          <p className="text-xs text-neutral-600">{summary}</p>
        </div>
        <button type="button" aria-label="Close comments" onClick={onClose} className={ICON_BUTTON}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {threads.length === 0 ? (
          <p className="px-1 py-2 text-neutral-600">{EMPTY_MESSAGE}</p>
        ) : null}
        {placed.length > 0 ? (
          <section aria-label="On this page" className="mb-3">
            <h3 className="px-1 pb-1 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
              On this page
            </h3>
            {open.length === 0 ? (
              <p className="px-1 py-1 text-neutral-600">No open comments.</p>
            ) : (
              <ul>{open.map((thread) => renderItem(thread, false))}</ul>
            )}
            {resolved.length > 0 ? (
              <div className="mt-2">
                <button
                  type="button"
                  aria-expanded={showResolved}
                  aria-controls={resolvedListId}
                  onClick={() => {
                    onShowResolvedChange(!showResolved);
                  }}
                  className={`px-1 ${TEXT_BUTTON}`}
                >
                  {showResolved ? "Hide" : "Show"} resolved ({resolved.length})
                </button>
                {showResolved ? (
                  <ul id={resolvedListId} className="mt-1">
                    {resolved.map((thread) => renderItem(thread, false))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
        {orphaned.length > 0 ? (
          <section aria-label="Orphaned">
            <h3 className="px-1 pb-1 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
              Orphaned
            </h3>
            <p className="px-1 pb-1 text-xs text-neutral-600">{ORPHAN_NOTE}</p>
            <ul>{orphaned.map((thread) => renderItem(thread, true))}</ul>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
