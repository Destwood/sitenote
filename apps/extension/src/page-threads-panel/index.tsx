import { useEffect, useState } from "react";

import { ERROR_CLASS, LINK_BUTTON_CLASS } from "../form-controls";
import { listPageThreads, openPageSidebar } from "../message-client";
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

  if (view.kind === "loading") {
    return (
      <p role="status" className="text-sm text-neutral-600">
        Loading comments...
      </p>
    );
  }

  if (view.kind === "error") {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">Open the page to see its comments.</p>
        <button type="button" onClick={retry} className={LINK_BUTTON_CLASS}>
          Try again
        </button>
      </div>
    );
  }

  const openCount = view.threads.filter((thread) => thread.status === "open").length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <span data-testid="comments-summary" className="text-neutral-900">
          {commentsSummary(view.threads.length, openCount)}
        </span>
        {view.threads.length > 0 ? (
          <>
            <span aria-hidden="true" className="text-neutral-400">
              ·
            </span>
            <button type="button" onClick={() => void openSidebar()} className={LINK_BUTTON_CLASS}>
              Open on page
            </button>
          </>
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
