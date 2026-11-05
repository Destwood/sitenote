export const JIRA_ISSUE_KEY = /^[A-Z][A-Z0-9_]+-[0-9]+$/;
export const JIRA_ISSUE_KEY_MAX = 64;

const JIRA_SITE_HOST = /^[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$/;

export interface AdfNode {
  type: string;
  text?: string;
  marks?: { type: string; attrs: { href: string } }[];
  content?: AdfNode[];
}

export interface AdfDocument {
  version: 1;
  type: "doc";
  content: AdfNode[];
}

export interface JiraIssueThread {
  jiraIssueKey: string | null;
  jiraIssueUrl: string | null;
}

export type IssueLinkDecision =
  { kind: "existing"; issueKey: string; issueUrl: string } | { kind: "link" };

export function normalizeJiraSiteUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const valid =
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "" &&
    JIRA_SITE_HOST.test(host);
  return valid ? `https://${host}` : null;
}

export function normalizeIssueKey(input: string): string | null {
  const key = input.trim().toUpperCase();
  return key.length <= JIRA_ISSUE_KEY_MAX && JIRA_ISSUE_KEY.test(key) ? key : null;
}

export function issueUrl(siteUrl: string, issueKey: string): string {
  return `${siteUrl}/browse/${issueKey}`;
}

export function buildLinkComment(deepLink: string): AdfDocument {
  return {
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Linked from Sitenote: " },
          { type: "text", text: deepLink, marks: [{ type: "link", attrs: { href: deepLink } }] },
        ],
      },
    ],
  };
}

export function decideIssueLink(thread: JiraIssueThread): IssueLinkDecision {
  const { jiraIssueKey: issueKey, jiraIssueUrl: url } = thread;
  if (issueKey !== null && url !== null) {
    return { kind: "existing", issueKey, issueUrl: url };
  }
  return { kind: "link" };
}
