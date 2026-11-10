import { useId, useState, type KeyboardEvent } from "react";

import { FOCUS_RING, ICON_BUTTON, TEXT_BUTTON } from "../control-classes";
import { useNow } from "../now";
import { formatRelativeTime } from "../relative-time";
import { RouteLabel, routeDisplayText } from "../route-label";
import type { SiteThreadItem, ThreadView } from "../types";
import { Z_INDEX } from "../z-index";

export const SIDEBAR_WIDTH = 320;
export const ORPHAN_NOTE =
  "The element these comments were attached to changed, so they could not be placed on the page.";
export const EMPTY_MESSAGE = "No comments on this page yet.";

export interface SidebarProps {
  threads: ThreadView[];
  otherPages?: SiteThreadItem[];
  currentRoute?: string;
  onOpenOtherPage?: (threadId: string) => void;
  onCopyRoute?: (route: string) => void;
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

function isOpen(item: { status: string }): boolean {
  return item.status === "open";
}

function isResolved(item: { status: string }): boolean {
  return item.status === "resolved";
}

export function Sidebar({
  threads,
  otherPages = [],
  onOpenOtherPage,
  onCopyRoute,
  activeThreadId = null,
  showResolved,
  onShowResolvedChange,
  onSelectThread,
  onClose,
}: SidebarProps) {
  const now = useNow();
  const titleId = useId();
  const [scopeFilter, setScopeFilter] = useState("all");

  const placed = threads.filter((thread) => !thread.orphaned);
  const open = placed.filter(isOpen);
  const resolved = placed.filter(isResolved);
  const orphaned = threads.filter((thread) => thread.orphaned);

  const isShown = (item: { status: string }) => isOpen(item) || (showResolved && isResolved(item));
  const allRoutes = [...new Set(otherPages.map((item) => item.route))].sort();
  const routeCount = (route: string) =>
    otherPages.filter((item) => item.route === route && isShown(item)).length;
  const pageCount = placed.filter(isShown).length + orphaned.length;
  const siteResolvedCount = resolved.length + otherPages.filter(isResolved).length;

  const scope =
    scopeFilter === "all" || scopeFilter === "page" || allRoutes.includes(scopeFilter)
      ? scopeFilter
      : "all";
  const routeOptions = allRoutes.filter((route) => routeCount(route) > 0 || route === scope);
  const inScope = (route: string) => scope === "all" || scope === route;
  const showPage = scope === "all" || scope === "page";
  const shownRoutes = routeOptions.filter(inScope);
  const scopedOther = otherPages.filter((item) => inScope(item.route));

  const visibleOpen = (showPage ? open.length : 0) + scopedOther.filter(isOpen).length;
  const visibleResolved = (showPage ? resolved.length : 0) + scopedOther.filter(isResolved).length;
  const visibleOrphaned = showPage ? orphaned.length : 0;

  const summary = [
    `${String(visibleOpen)} open`,
    `${String(visibleResolved)} resolved`,
    ...(visibleOrphaned > 0 ? [`${String(visibleOrphaned)} orphaned`] : []),
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

  function renderOtherItem(item: SiteThreadItem) {
    return (
      <li key={item.id}>
        <button
          type="button"
          onClick={() => {
            onOpenOtherPage?.(item.id);
          }}
          className={`flex w-full gap-2 rounded-md px-2 py-2 text-left hover:bg-neutral-100 ${FOCUS_RING}`}
        >
          <span
            aria-hidden="true"
            className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${item.status === "resolved" ? "bg-neutral-600" : "bg-blue-700"}`}
          >
            {item.number}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-neutral-600">
              <span className="sr-only">Thread {item.number}, </span>
              {item.status === "resolved" ? "Resolved · " : null}
              {item.authorName} · {item.replies} {item.replies === 1 ? "reply" : "replies"}
            </span>
            <span className="line-clamp-2 block break-words">{item.excerpt}</span>
          </span>
        </button>
      </li>
    );
  }

  const hasVisible = visibleOpen + visibleResolved + visibleOrphaned > 0;

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
      {otherPages.length > 0 ? (
        <div className="border-b border-neutral-200 px-3 py-2">
          <select
            aria-label="Filter by page"
            value={scope}
            onChange={(event) => {
              setScopeFilter(event.target.value);
            }}
            className={`w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900 ${FOCUS_RING}`}
          >
            <option value="all">All pages</option>
            {pageCount > 0 || scope === "page" ? (
              <option value="page">{`This page (${String(pageCount)})`}</option>
            ) : null}
            {routeOptions.map((route) => (
              <option key={route} value={route}>
                {`${routeDisplayText(route)} (${String(routeCount(route))})`}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {siteResolvedCount > 0 ? (
          <div className="mb-2">
            <button
              type="button"
              aria-expanded={showResolved}
              onClick={() => {
                onShowResolvedChange(!showResolved);
              }}
              className={`px-1 ${TEXT_BUTTON}`}
            >
              {showResolved ? "Hide" : "Show"} resolved ({siteResolvedCount})
            </button>
          </div>
        ) : null}
        {!hasVisible ? <p className="px-1 py-2 text-neutral-600">{EMPTY_MESSAGE}</p> : null}
        {showPage && placed.length > 0 ? (
          <section aria-label="On this page" className="mb-3">
            <h3 className="px-1 pb-1 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
              On this page
            </h3>
            {open.length === 0 ? (
              <p className="px-1 py-1 text-neutral-600">No open comments.</p>
            ) : (
              <ul>{open.map((thread) => renderItem(thread, false))}</ul>
            )}
            {showResolved && resolved.length > 0 ? (
              <ul className="mt-1">{resolved.map((thread) => renderItem(thread, false))}</ul>
            ) : null}
          </section>
        ) : null}
        {shownRoutes.map((route) => {
          const items = otherPages.filter((item) => item.route === route);
          const openItems = items.filter(isOpen);
          const resolvedItems = items.filter(isResolved);
          return (
            <section key={route} aria-label={route} className="mb-3">
              <h3 className="px-1 pb-1 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                {onCopyRoute === undefined ? (
                  routeDisplayText(route)
                ) : (
                  <RouteLabel route={route} onCopy={onCopyRoute} />
                )}
                {` (${String(routeCount(route))})`}
              </h3>
              {openItems.length > 0 ? <ul>{openItems.map(renderOtherItem)}</ul> : null}
              {showResolved && resolvedItems.length > 0 ? (
                <ul className="mt-1">{resolvedItems.map(renderOtherItem)}</ul>
              ) : null}
            </section>
          );
        })}
        {showPage && orphaned.length > 0 ? (
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
