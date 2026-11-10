import type { ReplayMode } from "@sitenote/core";
import type { KeyboardEvent } from "react";

import { CopyContextButton } from "../context-section";
import { ICON_BUTTON, PANEL_SURFACE, SECONDARY_BUTTON } from "../control-classes";
import { ReplayButton } from "../replay-button";
import { RouteLabel } from "../route-label";
import type { SiteThreadItem } from "../types";
import { Z_INDEX } from "../z-index";

export interface OffPageThreadCardProps {
  item: SiteThreadItem;
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
  sidebarOpen,
  onReproduce,
  onOpenPage,
  onToggleStatus,
  onCopyRoute,
  onCopyContext,
  onClose,
}: OffPageThreadCardProps) {
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
      className={`fixed top-20 flex w-[300px] max-w-[calc(100vw-32px)] flex-col gap-2 p-3 font-sans ${sidebarOpen ? "right-[336px]" : "right-4"} ${PANEL_SURFACE}`}
    >
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">Comment on another page</h2>
        <button type="button" aria-label="Close" onClick={onClose} className={ICON_BUTTON}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <RouteLabel route={item.route} onCopy={onCopyRoute} className="text-xs text-neutral-600" />
      <p className="flex items-center gap-2 text-xs text-neutral-600">
        <span>
          {item.authorName} · {item.replies} {item.replies === 1 ? "reply" : "replies"}
        </span>
        {item.status === "resolved" ? (
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 font-medium text-neutral-800">
            Resolved
          </span>
        ) : null}
      </p>
      <p className="line-clamp-3 break-words">{item.excerpt}</p>
      <div className="flex flex-wrap gap-2">
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
