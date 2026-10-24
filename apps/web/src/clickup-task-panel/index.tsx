"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClickUpTask, type ClickUpFailure } from "../clickup-api";
import { ERROR_CLASS, PRIMARY_BUTTON_CLASS } from "../form-controls";
import { safeExternalHref } from "../safe-external-link";
import { getSupabaseBrowserClient } from "../supabase-browser";

export const SCREENSHOT_MISSING_TEXT = "The task was created without the screenshot.";

interface ClickUpTaskPanelProps {
  threadId: string;
  taskUrl: string | null;
  canCreate: boolean;
}

export function ClickUpTaskPanel({ threadId, taskUrl, canCreate }: ClickUpTaskPanelProps) {
  const router = useRouter();
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<ClickUpFailure | null>(null);
  const [pending, setPending] = useState(false);

  const linkUrl = createdUrl ?? taskUrl;
  if (linkUrl === null && !canCreate) {
    return null;
  }
  const linkHref = linkUrl === null ? null : safeExternalHref(linkUrl);

  async function create() {
    setPending(true);
    setError(null);
    const outcome = await createClickUpTask(getSupabaseBrowserClient(), threadId);
    setPending(false);
    if (!outcome.ok) {
      setError(outcome);
      return;
    }
    setCreatedUrl(outcome.data.taskUrl);
    setNotice(outcome.data.screenshotAttached ? null : SCREENSHOT_MISSING_TEXT);
    router.refresh();
  }

  return (
    <section aria-label="ClickUp" className="flex flex-col gap-3">
      {linkUrl === null ? null : (
        <p className="text-sm text-neutral-700">
          ClickUp task:{" "}
          {linkHref === null ? (
            <span className="break-all">{linkUrl}</span>
          ) : (
            <a
              href={linkHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-neutral-900 underline underline-offset-4 break-all"
            >
              Open in ClickUp
            </a>
          )}
        </p>
      )}
      {linkUrl !== null || !canCreate ? null : (
        <button
          type="button"
          onClick={() => {
            void create();
          }}
          disabled={pending}
          className={`${PRIMARY_BUTTON_CLASS} w-fit`}
        >
          {pending ? "Creating the ClickUp task" : error === null ? "Create ClickUp task" : "Retry"}
        </button>
      )}
      {error === null ? null : (
        <p role="alert" data-error-code={error.code} className={ERROR_CLASS}>
          {error.message}
        </p>
      )}
      {notice === null ? null : <p className="text-sm text-neutral-600">{notice}</p>}
    </section>
  );
}
