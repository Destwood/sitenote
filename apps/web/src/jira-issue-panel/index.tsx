"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import {
  linkJiraIssue,
  normalizeIssueKey,
  searchJiraIssues,
  type JiraFailure,
  type JiraIssueSummary,
  type JiraProject,
} from "../jira-api";
import {
  DASH_CARD_CLASS,
  DASH_ERROR_CLASS,
  DASH_INPUT_CLASS,
  DASH_LABEL_CLASS,
} from "../dashboard-classes";
import { safeExternalHref } from "../safe-external-link";
import { getSupabaseBrowserClient } from "../supabase-browser";

export const INVALID_ISSUE_KEY_TEXT = "Enter a key like PROJ-123";
export const LINK_MISSING_TEXT =
  "The issue was linked, but the link could not be added to the Jira issue.";

const SEARCH_DEBOUNCE_MS = 300;

interface JiraIssuePanelProps {
  threadId: string;
  workspaceId: string;
  issueKey: string | null;
  issueUrl: string | null;
  canLink: boolean;
}

interface LinkedIssue {
  issueKey: string;
  issueUrl: string;
}

export function JiraIssuePanel({
  threadId,
  workspaceId,
  issueKey,
  issueUrl,
  canLink,
}: JiraIssuePanelProps) {
  const router = useRouter();
  const inputId = useId();
  const projectId = useId();
  const listboxId = useId();
  const [linked, setLinked] = useState<LinkedIssue | null>(null);
  const [query, setQuery] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [projects, setProjects] = useState<JiraProject[] | null>(null);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<JiraIssueSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<JiraFailure | null>(null);
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const issue = linked ?? (issueKey === null || issueUrl === null ? null : { issueKey, issueUrl });
  if (issue === null && !canLink) {
    return null;
  }
  const issueHref = issue === null ? null : safeExternalHref(issue.issueUrl);

  function optionId(index: number): string {
    return `${listboxId}-option-${String(index)}`;
  }

  async function runSearch(text: string, key: string, withProjects: boolean) {
    const id = ++requestId.current;
    setSearching(true);
    setSearchError(null);
    const outcome = await searchJiraIssues(
      getSupabaseBrowserClient(),
      workspaceId,
      text,
      key === "" ? undefined : key,
      withProjects,
    );
    if (id !== requestId.current) {
      return;
    }
    setSearching(false);
    setActiveIndex(-1);
    if (!outcome.ok) {
      setResults([]);
      setSearchError(outcome.message);
      return;
    }
    setResults(outcome.issues);
    if (withProjects) {
      setProjects(outcome.projects);
    }
  }

  function scheduleSearch(text: string, key: string) {
    setSearching(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void runSearch(text, key, projects === null);
    }, SEARCH_DEBOUNCE_MS);
  }

  async function link(key: string) {
    if (pending) {
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
    setNotice(outcome.data.linkAdded ? null : LINK_MISSING_TEXT);
    router.refresh();
  }

  function linkTyped() {
    const key = normalizeIssueKey(query);
    if (key === null) {
      setError({ ok: false, message: INVALID_ISSUE_KEY_TEXT });
      return;
    }
    void link(key);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const picked = activeIndex < 0 ? undefined : results[activeIndex];
      if (picked === undefined) {
        linkTyped();
      } else {
        void link(picked.key);
      }
    }
  }

  function keepFocus(event: MouseEvent<HTMLLIElement>) {
    event.preventDefault();
  }

  const status = searching
    ? "Searching…"
    : results.length === 0 && searchError === null
      ? "No issues found"
      : null;

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
        <div className="flex flex-col gap-3">
          <div className="relative flex flex-col gap-1.5">
            <label htmlFor={inputId} className={DASH_LABEL_CLASS}>
              Search Jira issues
              <input
                id={inputId}
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-controls={open ? listboxId : undefined}
                aria-autocomplete="list"
                aria-activedescendant={activeIndex < 0 ? undefined : optionId(activeIndex)}
                placeholder="PROJ-123 or words from the summary"
                autoComplete="off"
                spellCheck={false}
                disabled={pending}
                value={query}
                onFocus={() => {
                  setOpen(true);
                  scheduleSearch(query, projectKey);
                }}
                onBlur={() => {
                  setOpen(false);
                }}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setOpen(true);
                  scheduleSearch(event.target.value, projectKey);
                }}
                onKeyDown={handleKeyDown}
                className={DASH_INPUT_CLASS}
              />
            </label>
            {open ? (
              <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
                <ul
                  id={listboxId}
                  role="listbox"
                  aria-label="Jira issues"
                  className="max-h-72 overflow-y-auto"
                >
                  {results.map((result, index) => (
                    <li
                      key={result.key}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseDown={keepFocus}
                      onClick={() => {
                        void link(result.key);
                      }}
                      className={`cursor-pointer rounded-md px-2 py-2 ${
                        index === activeIndex ? "bg-neutral-100" : ""
                      }`}
                    >
                      <span className="block text-sm font-medium text-neutral-900">
                        {`${result.key} · ${result.summary}`}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {`${result.status} · ${result.projectName}`}
                      </span>
                    </li>
                  ))}
                </ul>
                {status === null ? null : (
                  <p role="status" className="px-2 py-2 text-sm text-neutral-600">
                    {status}
                  </p>
                )}
                {searchError === null ? null : (
                  <p role="alert" className={`${DASH_ERROR_CLASS} m-1`}>
                    {searchError}
                  </p>
                )}
              </div>
            ) : null}
          </div>
          <label htmlFor={projectId} className={DASH_LABEL_CLASS}>
            Jira project
            <select
              id={projectId}
              value={projectKey}
              onChange={(event) => {
                setProjectKey(event.target.value);
                scheduleSearch(query, event.target.value);
              }}
              className={DASH_INPUT_CLASS}
            >
              <option value="">All projects</option>
              {(projects ?? []).map((project) => (
                <option key={project.key} value={project.key}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          {pending ? <p className="text-sm text-neutral-600">Linking the Jira issue</p> : null}
        </div>
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
