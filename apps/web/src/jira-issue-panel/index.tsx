"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type SyntheticEvent } from "react";

import { linkJiraIssue, normalizeIssueKey, type JiraFailure } from "../jira-api";
import {
  DASH_BUTTON_PRIMARY_CLASS,
  DASH_CARD_CLASS,
  DASH_ERROR_CLASS,
  DASH_INPUT_CLASS,
  DASH_LABEL_CLASS,
} from "../dashboard-classes";
import { safeExternalHref } from "../safe-external-link";
import { getSupabaseBrowserClient } from "../supabase-browser";

export const INVALID_ISSUE_KEY_TEXT = "Enter a key like PROJ-123";
export const COMMENT_MISSING_TEXT =
  "The issue was linked, but the comment could not be added to Jira.";

interface JiraIssuePanelProps {
  threadId: string;
  issueKey: string | null;
  issueUrl: string | null;
  canLink: boolean;
}

interface LinkedIssue {
  issueKey: string;
  issueUrl: string;
}

export function JiraIssuePanel({ threadId, issueKey, issueUrl, canLink }: JiraIssuePanelProps) {
  const router = useRouter();
  const inputId = useId();
  const [linked, setLinked] = useState<LinkedIssue | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<JiraFailure | null>(null);
  const [pending, setPending] = useState(false);

  const issue = linked ?? (issueKey === null || issueUrl === null ? null : { issueKey, issueUrl });
  if (issue === null && !canLink) {
    return null;
  }
  const issueHref = issue === null ? null : safeExternalHref(issue.issueUrl);

  async function link(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = normalizeIssueKey(keyInput);
    if (key === null) {
      setError({ ok: false, message: INVALID_ISSUE_KEY_TEXT });
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    const outcome = await linkJiraIssue(getSupabaseBrowserClient(), threadId, key);
    setPending(false);
    if (!outcome.ok) {
      setError(outcome);
      return;
    }
    setLinked({ issueKey: outcome.data.issueKey, issueUrl: outcome.data.issueUrl });
    setNotice(outcome.data.commentAdded ? null : COMMENT_MISSING_TEXT);
    router.refresh();
  }

  return (
    <section aria-label="Jira" className={`${DASH_CARD_CLASS} flex flex-col gap-3 p-4`}>
      {issue === null ? null : (
        <p className="text-sm text-neutral-700">
          Jira issue:{" "}
          {issueHref === null ? (
            <span>{issue.issueKey}</span>
          ) : (
            <a
              href={issueHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-neutral-900 underline underline-offset-4"
            >
              {issue.issueKey}
            </a>
          )}
        </p>
      )}
      {issue !== null || !canLink ? null : (
        <form
          onSubmit={(event) => {
            void link(event);
          }}
          className="flex flex-col gap-3"
        >
          <label htmlFor={inputId} className={DASH_LABEL_CLASS}>
            Jira issue key
            <input
              id={inputId}
              type="text"
              placeholder="PROJ-123"
              autoComplete="off"
              spellCheck={false}
              value={keyInput}
              onChange={(event) => {
                setKeyInput(event.target.value);
              }}
              className={DASH_INPUT_CLASS}
            />
          </label>
          <button type="submit" disabled={pending} className={`${DASH_BUTTON_PRIMARY_CLASS} w-fit`}>
            {pending ? "Linking the Jira issue" : "Link issue"}
          </button>
        </form>
      )}
      {error === null ? null : (
        <p role="alert" data-error-code={error.code} className={DASH_ERROR_CLASS}>
          {error.message}
        </p>
      )}
      {notice === null ? null : <p className="text-sm text-neutral-600">{notice}</p>}
    </section>
  );
}
