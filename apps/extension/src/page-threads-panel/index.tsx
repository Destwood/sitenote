import { useEffect, useState } from "react";

import { ERROR_CLASS, LINK_BUTTON_CLASS } from "../form-controls";
import { Icon } from "../icon";
import { listPageThreads, openPageSidebar, openPageThread } from "../message-client";
import { ERROR_MESSAGES, type PageThreadSummary } from "@sitenote/widget";

type View =
  { kind: "loading" } | { kind: "error" } | { kind: "ready"; threads: PageThreadSummary[] };

interface PageThreadsPanelProps {
  tabId: number;
  close?: () => void;
}

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

export function PageThreadsPanel({ tabId, close = closePopup }: PageThreadsPanelProps) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [openError, setOpenError] = useState<string | null>(null);

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
              <span className="text-xs text-neutral-500">On this page</span>
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
        <p data-testid="comments-summary" className="px-3 py-2 text-xs text-neutral-700">
          {commentsSummary(view.threads.length, openCount)}
        </p>
        {hasThreads ? (
          <ul
            aria-label="Comments on this page"
            className="max-h-44 divide-y divide-neutral-100 overflow-y-auto border-t border-neutral-200"
          >
            {view.threads.map((thread) => (
              <li key={thread.id}>
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
              </li>
            ))}
          </ul>
        ) : null}
        {hasThreads ? (
          <button
            type="button"
            onClick={() => void openSidebar()}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-b-lg border-t border-neutral-200 text-xs font-semibold text-blue-600 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            Open all comments on page
            <Icon name="external" size={13} />
          </button>
        ) : null}
      </div>
      {openError === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {openError}
        </p>
      )}
    </div>
  );
}
