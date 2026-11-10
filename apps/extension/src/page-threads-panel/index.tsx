import { useEffect, useId, useState, type KeyboardEvent } from "react";

import { ERROR_CLASS, LINK_BUTTON_CLASS } from "../form-controls";
import { Icon } from "../icon";
import { listPageThreads, openPageSidebar, openPageThread } from "../message-client";
import { RouteLabel, routeDisplayText } from "@sitenote/ui";
import { ERROR_MESSAGES, type PageThreadSummary } from "@sitenote/widget";

type View =
  { kind: "loading" } | { kind: "error" } | { kind: "ready"; threads: PageThreadSummary[] };

type ThreadTab = PageThreadSummary["status"];

interface PageThreadsPanelProps {
  tabId: number;
  dashboardUrl: string;
  close?: () => void;
}

const FOOTER_BUTTON_CLASS =
  "flex h-9 items-center justify-center gap-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900";

function closePopup(): void {
  window.close();
}

async function fetchView(tabId: number): Promise<View> {
  const result = await listPageThreads(tabId);
  return result.ok ? { kind: "ready", threads: result.data } : { kind: "error" };
}

export function commentsSummary(total: number, open: number): string {
  if (total === 0) {
    return "No comments yet";
  }
  if (open === 0) {
    return "No open comments";
  }
  return open === 1 ? "1 open comment" : `${String(open)} open comments`;
}

export function PageThreadsPanel({
  tabId,
  dashboardUrl,
  close = closePopup,
}: PageThreadsPanelProps) {
  const id = useId();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [openError, setOpenError] = useState<string | null>(null);
  const [tab, setTab] = useState<ThreadTab>("open");
  const [routeFilter, setRouteFilter] = useState("all");
  const [copyStatus, setCopyStatus] = useState<{ message: string } | null>(null);

  useEffect(() => {
    if (copyStatus === null) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCopyStatus(null);
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [copyStatus]);

  useEffect(() => {
    let active = true;
    void fetchView(tabId).then((next) => {
      if (active) {
        setView(next);
      }
    });
    return () => {
      active = false;
    };
  }, [tabId]);

  function retry() {
    setView({ kind: "loading" });
    void fetchView(tabId).then(setView);
  }

  async function openSidebar() {
    setOpenError(null);
    const result = await openPageSidebar(tabId);
    if (!result.ok) {
      setOpenError(ERROR_MESSAGES[result.error.code]);
      return;
    }
    close();
  }

  async function openThread(threadId: string) {
    setOpenError(null);
    const result = await openPageThread(tabId, threadId);
    if (!result.ok) {
      setOpenError(ERROR_MESSAGES[result.error.code]);
      return;
    }
    close();
  }

  async function copyRoute(route: string) {
    try {
      await navigator.clipboard.writeText(route);
      setCopyStatus({ message: "Route copied" });
    } catch {
      setCopyStatus({ message: "Could not copy the route" });
    }
  }

  if (view.kind === "loading") {
    return (
      <p role="status" className="text-sm text-neutral-500">
        Loading comments...
      </p>
    );
  }

  if (view.kind === "error") {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">Open the page to see its comments.</p>
        <button type="button" onClick={retry} className={LINK_BUTTON_CLASS}>
          Try again
        </button>
      </div>
    );
  }

  const openCount = view.threads.filter((thread) => thread.status === "open").length;
  const hasThreads = view.threads.length > 0;
  const routes = [...new Set(view.threads.map((thread) => thread.route))];
  const multiRoute = routes.length > 1;
  const currentRoute = view.threads.find((thread) => thread.current)?.route;
  const tabThreads = view.threads.filter((thread) => thread.status === tab);
  const tabRouteCount = new Set(tabThreads.map((thread) => thread.route)).size;
  const filterRoutes = routes.filter(
    (route) => route === routeFilter || tabThreads.some((thread) => thread.route === route),
  );
  const showRouteFilter = tabRouteCount > 1 || routeFilter !== "all";
  const scopedThreads =
    routeFilter === "all"
      ? view.threads
      : view.threads.filter((thread) => thread.route === routeFilter);
  const scopedOpenCount = scopedThreads.filter((thread) => thread.status === "open").length;
  const scopedResolvedCount = scopedThreads.length - scopedOpenCount;
  const visibleThreads = scopedThreads.filter((thread) => thread.status === tab);
  const panelId = `${id}-panel`;
  const tabIdOf = (value: ThreadTab) => `${id}-tab-${value}`;
  const tabs = [
    { value: "open", label: `Open (${String(scopedOpenCount)})` },
    { value: "resolved", label: `Resolved (${String(scopedResolvedCount)})` },
  ] as const;

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const next: ThreadTab = tab === "open" ? "resolved" : "open";
    setTab(next);
    document.getElementById(tabIdOf(next))?.focus();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col rounded-lg border border-neutral-200">
        <div className="flex items-center justify-between gap-3 rounded-t-lg bg-neutral-50 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
            >
              {openCount}
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-neutral-900">Open comments</span>
              <span className="text-xs text-neutral-500">On this site</span>
            </span>
          </div>
          {hasThreads ? (
            <button
              type="button"
              aria-label="Open comments"
              onClick={() => void openSidebar()}
              className="flex size-7 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
            >
              <Icon name="arrow" size={15} />
            </button>
          ) : null}
        </div>
        {hasThreads ? (
          <>
            {showRouteFilter ? (
              <select
                aria-label="Filter by page"
                value={routeFilter}
                onChange={(event) => {
                  setRouteFilter(event.target.value);
                }}
                className="w-full border-t border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-neutral-900"
              >
                <option value="all">{`All pages (${String(tabThreads.length)})`}</option>
                {filterRoutes.map((route) => (
                  <option key={route} value={route}>
                    {`${route === currentRoute ? "This page" : routeDisplayText(route)} (${String(tabThreads.filter((thread) => thread.route === route).length)})`}
                  </option>
                ))}
              </select>
            ) : null}
            <div
              role="tablist"
              aria-label="Comments by status"
              className="grid grid-cols-2 border-t border-neutral-200"
            >
              {tabs.map(({ value, label }) => {
                const selected = tab === value;
                return (
                  <button
                    key={value}
                    id={tabIdOf(value)}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={panelId}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => {
                      setTab(value);
                    }}
                    onKeyDown={onTabKeyDown}
                    className={`h-9 border-b-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-neutral-900 ${selected ? "border-blue-600 font-semibold text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div role="tabpanel" id={panelId} aria-labelledby={tabIdOf(tab)}>
              {visibleThreads.length === 0 ? (
                <p className="px-3 py-3 text-xs text-neutral-700">
                  {tab === "open" ? "No open comments" : "No resolved comments"}
                </p>
              ) : (
                <ul
                  aria-label="Comments on this page"
                  className="max-h-44 divide-y divide-neutral-100 overflow-y-auto border-t border-neutral-200"
                >
                  {visibleThreads.map((thread) => (
                    <li key={thread.id} className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => void openThread(thread.id)}
                        className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-neutral-900"
                      >
                        <span
                          aria-hidden="true"
                          className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${thread.status === "open" ? "bg-blue-600 text-white" : "bg-neutral-200 text-neutral-600"}`}
                        >
                          {thread.number}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-neutral-900">
                              {thread.authorName}
                            </span>
                            {thread.replies > 0 ? (
                              <span className="flex shrink-0 items-center gap-1 text-[11px] text-neutral-500">
                                <Icon name="comment" size={11} />
                                {thread.replies}
                              </span>
                            ) : null}
                          </span>
                          <span className="line-clamp-2 text-xs text-neutral-600">
                            {thread.excerpt === "" ? "(no text)" : thread.excerpt}
                          </span>
                          {thread.status === "open" ? null : (
                            <span className="text-[10px] text-neutral-500">Resolved</span>
                          )}
                          {thread.detached ? (
                            <span className="text-[10px] text-neutral-500">Not found on page</span>
                          ) : null}
                        </span>
                      </button>
                      {multiRoute ? (
                        <div className="px-3 pb-2">
                          <RouteLabel
                            route={thread.route}
                            onCopy={(route) => void copyRoute(route)}
                            className="text-[10px] text-neutral-500"
                          />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid grid-cols-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => void openSidebar()}
                className={`${FOOTER_BUTTON_CLASS} rounded-bl-lg`}
              >
                Show all
                <Icon name="external" size={13} />
              </button>
              <a
                href={dashboardUrl}
                target="_blank"
                rel="noreferrer"
                className={`${FOOTER_BUTTON_CLASS} rounded-br-lg border-l border-neutral-200`}
              >
                <Icon name="table" size={13} />
                Open dashboard
              </a>
            </div>
          </>
        ) : (
          <p data-testid="comments-summary" className="px-3 py-2 text-xs text-neutral-700">
            {commentsSummary(view.threads.length, openCount)}
          </p>
        )}
      </div>
      {copyStatus === null ? null : (
        <p role="status" className="text-xs text-neutral-600">
          {copyStatus.message}
        </p>
      )}
      {openError === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {openError}
        </p>
      )}
    </div>
  );
}
