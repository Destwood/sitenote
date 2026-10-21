import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { CommentItem } from "../comment-item";
import { Composer } from "../composer";
import { ICON_BUTTON, PANEL_SURFACE, SECONDARY_BUTTON } from "../control-classes";
import { useNow } from "../now";
import { VIEWPORT_MARGIN, placePanel, type AnchorRect } from "../placement";
import type { ThreadView } from "../types";
import { useViewport } from "../viewport";
import { Z_INDEX } from "../z-index";

export const PANEL_WIDTH = 320;

export interface ThreadPanelProps {
  thread: ThreadView | null;
  anchorRect: AnchorRect;
  canChangeStatus: boolean;
  error?: string | undefined;
  onSubmit: (body: string) => Promise<void>;
  onEditComment: (commentId: string, body: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onToggleStatus: () => void;
  onClose: () => void;
}

function activeElementIn(node: Node): Element | null {
  const root = node.getRootNode();
  if (root.nodeType === Node.DOCUMENT_NODE || root.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    return (root as Document | ShadowRoot).activeElement ?? null;
  }
  return null;
}

export function ThreadPanel({
  thread,
  anchorRect,
  canChangeStatus,
  error,
  onSubmit,
  onEditComment,
  onDeleteComment,
  onToggleStatus,
  onClose,
}: ThreadPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const viewport = useViewport();
  const now = useNow();
  const titleId = useId();

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (panel === null) {
      return;
    }
    const previous = activeElementIn(panel);
    const observer = new ResizeObserver(() => {
      setHeight(panel.getBoundingClientRect().height);
    });
    observer.observe(panel);
    return () => {
      observer.disconnect();
      const active = activeElementIn(panel);
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        (active === null || panel.contains(active))
      ) {
        previous.focus();
      }
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.stopPropagation();
      onClose();
    }
  }

  const { left, top } = placePanel(anchorRect, { width: PANEL_WIDTH, height }, viewport);
  const isNew = thread === null;
  const resolved = thread?.status === "resolved";
  const title = isNew ? "New thread" : `Thread ${String(thread.number)}`;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
      style={{
        left,
        top,
        width: PANEL_WIDTH,
        maxHeight: viewport.height - 2 * VIEWPORT_MARGIN,
        zIndex: Z_INDEX.panel,
      }}
      className={`fixed flex flex-col ${PANEL_SURFACE}`}
    >
      <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
        <h2 id={titleId} className="text-sm font-semibold">
          {title}
        </h2>
        {thread === null ? null : (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${resolved ? "bg-neutral-200 text-neutral-800" : "bg-blue-100 text-blue-900"}`}
          >
            {resolved ? "Resolved" : "Open"}
          </span>
        )}
        <span className="flex-1" />
        {thread !== null && canChangeStatus ? (
          <button type="button" onClick={onToggleStatus} className={SECONDARY_BUTTON}>
            {resolved ? "Reopen" : "Resolve"}
          </button>
        ) : null}
        <button type="button" aria-label="Close thread" onClick={onClose} className={ICON_BUTTON}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {thread === null ? null : (
        <ul className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto px-3">
          {thread.comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              now={now}
              onEdit={(body) => onEditComment(comment.id, body)}
              onDelete={() => onDeleteComment(comment.id)}
            />
          ))}
        </ul>
      )}
      <div className={thread === null ? "p-3" : "border-t border-neutral-200 p-3"}>
        <Composer
          label={isNew ? "Comment" : "Reply"}
          submitLabel={isNew ? "Comment" : "Reply"}
          placeholder={isNew ? "Add a comment" : "Reply to this thread"}
          autoFocus
          error={error}
          onSubmit={onSubmit}
          onCancel={isNew ? onClose : undefined}
        />
      </div>
    </div>
  );
}
