import type { ReplayMode } from "@sitenote/core";
import type { KeyboardEvent } from "react";

import { CommentItem } from "../comment-item";
import { ContextSection, CopyContextButton } from "../context-section";
import { ICON_BUTTON, PANEL_SURFACE, SECONDARY_BUTTON } from "../control-classes";
import { useNow } from "../now";
import { ReplayButton } from "../replay-button";
import { RouteLabel } from "../route-label";
import type { SiteThreadItem, ThreadView } from "../types";
import { Z_INDEX } from "../z-index";

export interface OffPageThreadCardProps {
  item: SiteThreadItem;
  thread?: ThreadView | undefined;
  sidebarOpen: boolean;
  onReproduce: (mode: ReplayMode) => void;
  onOpenPage: () => void;
  onToggleStatus: () => void;
  onCopyRoute: (route: string) => void;
  onCopyContext?: (() => Promise<boolean> | boolean) | undefined;
  onClose: () => void;
}

export function OffPageThreadCard({
  item,
  thread,
  sidebarOpen,
  onReproduce,
  onOpenPage,
  onToggleStatus,
  onCopyRoute,
  onCopyContext,
  onClose,
}: OffPageThreadCardProps) {
  const now = useNow();

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Comment on another page"
      onKeyDown={handleKeyDown}
      style={{ zIndex: Z_INDEX.panel }}
      className={`fixed top-20 flex max-h-[calc(100vh-112px)] w-[300px] max-w-[calc(100vw-32px)] flex-col gap-2 p-3 font-sans ${sidebarOpen ? "right-[336px]" : "right-4"} ${PANEL_SURFACE}`}
    >
      <div className="flex shrink-0 items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">Comment on another page</h2>
        <button type="button" aria-label="Close" onClick={onClose} className={ICON_BUTTON}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <RouteLabel
        route={item.route}
        onCopy={onCopyRoute}
        className="shrink-0 text-xs text-neutral-600"
      />
      <p className="flex shrink-0 items-center gap-2 text-xs text-neutral-600">
        <span>
          {item.authorName} · {item.replies} {item.replies === 1 ? "reply" : "replies"}
        </span>
        {item.status === "resolved" ? (
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 font-medium text-neutral-800">
            Resolved
          </span>
        ) : null}
      </p>
      {thread === undefined ? (
        <p className="line-clamp-3 break-words">{item.excerpt}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ul className="divide-y divide-neutral-100">
            {thread.comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                now={now}
                onEdit={() => Promise.resolve()}
                onDelete={() => Promise.resolve()}
              />
            ))}
          </ul>
          <ContextSection
            context={thread.context}
            hasScreenshot={false}
            screenshot={{ status: "unavailable" }}
            recording={{ status: "unavailable" }}
            onCopyContext={undefined}
          />
        </div>
      )}
      <div className="flex shrink-0 flex-wrap gap-2">
        {item.hasSteps ? <ReplayButton label="Reproduce" onReplay={onReproduce} /> : null}
        <button type="button" onClick={onOpenPage} className={SECONDARY_BUTTON}>
          Open page
        </button>
        <button type="button" onClick={onToggleStatus} className={SECONDARY_BUTTON}>
          {item.status === "open" ? "Resolve" : "Reopen"}
        </button>
        {onCopyContext === undefined ? null : <CopyContextButton onCopyContext={onCopyContext} />}
      </div>
    </div>
  );
}
