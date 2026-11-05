import { useState, type SubmitEvent } from "react";

import { SECONDARY_BUTTON } from "../control-classes";

export interface JiraIssueState {
  issueKey: string | null;
  issueUrl: string | null;
  canLink: boolean;
  pending: boolean;
  onLink: (issueKey: string) => void;
}

const JIRA_ISSUE_KEY = /^[A-Z][A-Z0-9_]+-[0-9]+$/;
const JIRA_ISSUE_KEY_MAX_LENGTH = 64;

function normalizeIssueKey(input: string): string | null {
  const key = input.trim().toUpperCase();
  return key.length <= JIRA_ISSUE_KEY_MAX_LENGTH && JIRA_ISSUE_KEY.test(key) ? key : null;
}

export function JiraIssue({ issueKey, issueUrl, canLink, pending, onLink }: JiraIssueState) {
  const [draft, setDraft] = useState("");
  if (issueKey !== null) {
    return issueUrl?.startsWith("https://") === true ? (
      <a
        href={issueUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-900 underline underline-offset-2"
      >
        {`Jira ${issueKey}`}
      </a>
    ) : null;
  }
  if (!canLink) {
    return null;
  }
  const key = normalizeIssueKey(draft);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (key !== null && !pending) {
      onLink(key);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input
        type="text"
        aria-label="Jira issue key"
        placeholder="PROJ-123"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        className="block w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-700"
      />
      <button
        type="submit"
        disabled={pending || key === null}
        className={`${SECONDARY_BUTTON} w-fit`}
      >
        {pending ? "Linking the Jira issue" : "Link Jira issue"}
      </button>
    </form>
  );
}
