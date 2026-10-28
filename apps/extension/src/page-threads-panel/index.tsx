import { useEffect, useState } from "react";

import { ERROR_CLASS, SECONDARY_BUTTON_CLASS } from "../form-controls";
import { listPageThreads, openPageThread } from "../message-client";
import { ERROR_MESSAGES, THREAD_NOT_HERE_MESSAGE, type PageThreadSummary } from "@sitenote/widget";

const ITEM_CLASS =
  "flex w-full flex-col gap-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-left hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900";
const BADGE_CLASS =
  "rounded-sm bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-700";

type View =
  { kind: "loading" } | { kind: "error" } | { kind: "ready"; threads: PageThreadSummary[] };

interface PageThreadsPanelProps {
  tabId: number;
  onCount: (openCount: number) => void;
  close?: () => void;
}

function closePopup(): void {
  window.close();
}

async function fetchView(tabId: number): Promise<View> {
  const result = await listPageThreads(tabId);
  return result.ok ? { kind: "ready", threads: result.data } : { kind: "error" };
}

function byStatusThenNumber(a: PageThreadSummary, b: PageThreadSummary): number {
  return Number(a.status === "resolved") - Number(b.status === "resolved") || a.number - b.number;
}

function repliesLabel(count: number): string {
  return count === 1 ? "1 reply" : `${String(count)} replies`;
}

export function PageThreadsPanel({ tabId, onCount, close = closePopup }: PageThreadsPanelProps) {
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

  useEffect(() => {
    if (view.kind === "ready") {
      onCount(view.threads.filter((thread) => thread.status === "open").length);
    }
  }, [view, onCount]);

  function retry() {
    setView({ kind: "loading" });
    void fetchView(tabId).then(setView);
  }

  async function open(threadId: string) {
    setOpenError(null);
    const result = await openPageThread(tabId, threadId);
    if (!result.ok) {
      setOpenError(ERROR_MESSAGES[result.error.code]);
      return;
    }
    if (!result.data.opened) {
      setOpenError(THREAD_NOT_HERE_MESSAGE);
      return;
    }
    close();
  }

  if (view.kind === "loading") {
    return (
      <p role="status" className="border-t border-neutral-200 pt-4 text-sm text-neutral-600">
        Loading comments...
      </p>
    );
  }

  if (view.kind === "error") {
    return (
      <div className="flex flex-col gap-3 border-t border-neutral-200 pt-4">
        <p className="text-sm text-neutral-600">Open the page to see its comments.</p>
        <button type="button" onClick={retry} className={SECONDARY_BUTTON_CLASS}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-neutral-200 pt-4">
      <h2 className="text-sm font-semibold text-neutral-900">Comments on this page</h2>
      {view.threads.length === 0 ? (
        <p className="text-sm text-neutral-600">
          No comments yet. Turn on Comment mode or right-click an element.
        </p>
      ) : (
        <ul aria-label="Comments on this page" className="flex flex-col gap-2">
          {[...view.threads].sort(byStatusThenNumber).map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                onClick={() => {
                  void open(thread.id);
                }}
                className={ITEM_CLASS}
              >
                <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-neutral-900">
                  #{thread.number}
                  {thread.status === "resolved" ? (
                    <span className={BADGE_CLASS}>Resolved</span>
                  ) : null}
                  {thread.detached ? <span className={BADGE_CLASS}>Detached</span> : null}
                </span>
                <span className="break-words text-sm text-neutral-900">
                  {thread.excerpt === "" ? "No text" : thread.excerpt}
                </span>
                <span className="text-xs text-neutral-600">
                  {thread.authorName} · {repliesLabel(thread.replies)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {openError === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {openError}
        </p>
      )}
    </div>
  );
}
