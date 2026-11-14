import type { ReplayMode } from "@sitenote/core";
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { ClickUpTask, type ClickUpTaskState } from "../clickup-task";
import { CommentItem } from "../comment-item";
import { Composer, type ComposerSubmission } from "../composer";
import { ContextSection } from "../context-section";
import { ICON_BUTTON, PANEL_SURFACE, SECONDARY_BUTTON } from "../control-classes";
import { JiraIssue, type JiraIssueState } from "../jira-issue";
import { useNow } from "../now";
import { VIEWPORT_MARGIN, placePanel, type AnchorRect } from "../placement";
import { ShareControl, type ThreadShareControl } from "../share-control";
import type { PersonView, ScreenshotState, ThreadView } from "../types";
import { useViewport } from "../viewport";
import { Z_INDEX } from "../z-index";

export const PANEL_WIDTH = 320;

export interface ThreadPanelProps {
  thread: ThreadView | null;
  anchorRect: AnchorRect;
  zIndex?: number | undefined;
  canChangeStatus: boolean;
  error?: string | undefined;
  mentionCandidates?: readonly PersonView[] | undefined;
  screenshot?: ScreenshotState | undefined;
  recording?: ScreenshotState | undefined;
  recordingAttached?: boolean | undefined;
  clickUp?: ClickUpTaskState | undefined;
  jira?: JiraIssueState | undefined;
  share?: ThreadShareControl | undefined;
  onReplaySteps?: ((mode: ReplayMode) => void) | undefined;
  onCopyContext?: (() => Promise<boolean> | boolean) | undefined;
  onSubmit: (submission: ComposerSubmission) => Promise<void>;
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
  zIndex = Z_INDEX.panel,
  canChangeStatus,
  error,
  mentionCandidates,
  screenshot,
  recording,
  recordingAttached,
  clickUp,
  jira,
  share,
  onReplaySteps,
  onCopyContext,
  onSubmit,
  onEditComment,
  onDeleteComment,
  onToggleStatus,
  onClose,
}: ThreadPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [pinned, setPinned] = useState(false);
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

  const closeOnOutsidePointer = useEffectEvent(() => {
    onClose();
  });
  const isNew = thread === null;

  useEffect(() => {
    if (isNew || pinned) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      const panel = panelRef.current;
      if (panel === null) {
        return;
      }
      const root = panel.getRootNode();
      const inside =
        root instanceof ShadowRoot
          ? event.composedPath().includes(root.host)
          : panel.contains(event.target as Node);
      if (!inside) {
        closeOnOutsidePointer();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [isNew, pinned]);

  const { left, top } = placePanel(anchorRect, { width: PANEL_WIDTH, height }, viewport);
  const resolved = thread?.status === "resolved";
  const title = isNew ? "New thread" : `Thread ${String(thread.number)}`;
  const pinLabel = pinned ? "Unpin thread" : "Keep thread open";

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
        zIndex,
      }}
      className={`fixed flex flex-col ${PANEL_SURFACE}`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2">
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
        {thread === null ? null : (
          <button
            type="button"
            aria-pressed={pinned}
            aria-label={pinLabel}
            title={pinLabel}
            onClick={() => {
              setPinned((value) => !value);
            }}
            className={pinned ? `${ICON_BUTTON} bg-blue-100 text-blue-900` : ICON_BUTTON}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill={pinned ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 17v5" />
              <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6z" />
            </svg>
          </button>
        )}
        {thread !== null && share !== undefined ? <ShareControl {...share} /> : null}
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
        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          <ul className="divide-y divide-neutral-100">
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
          {clickUp === undefined ? null : (
            <div className="py-3">
              <ClickUpTask {...clickUp} />
            </div>
          )}
          {jira === undefined ? null : (
            <div className="py-3">
              <JiraIssue {...jira} />
            </div>
          )}
          <ContextSection
            context={thread.context}
            hasScreenshot={thread.hasScreenshot}
            screenshot={screenshot}
            recording={recording}
            onReplaySteps={onReplaySteps}
            onCopyContext={onCopyContext}
          />
        </div>
      )}
      <div className={thread === null ? "p-3" : "border-t border-neutral-200 p-3"}>
        <Composer
          label={isNew ? "Comment" : "Reply"}
          submitLabel={isNew ? "Comment" : "Reply"}
          placeholder={isNew ? "Add a comment" : "Reply to this thread"}
          autoFocus
          error={error}
          mentionCandidates={mentionCandidates}
          startsSignedOutOption={isNew && recordingAttached === true}
          onSubmit={onSubmit}
          onCancel={isNew ? onClose : undefined}
        />
      </div>
    </div>
  );
}
