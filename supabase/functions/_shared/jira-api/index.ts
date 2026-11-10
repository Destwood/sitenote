import * as z from "zod/mini";

import { ApiError } from "../api/index.ts";
import type { AdfDocument } from "../jira-issue/index.ts";

export const JIRA_TIMEOUT_MS = 10_000;

export interface JiraClientOptions {
  baseUrl: string;
  email: string;
  token: string;
  fetch: typeof fetch;
}

export interface JiraIssue {
  key: string;
}

export interface JiraIssueSummary {
  key: string;
  summary: string;
  status: string;
  projectKey: string;
  projectName: string;
}

export interface JiraProject {
  key: string;
  name: string;
}

export interface RemoteLink {
  globalId: string;
  url: string;
  title: string;
}

export interface JiraClient {
  verifyCredentials(): Promise<boolean>;
  getIssue(issueKey: string): Promise<JiraIssue>;
  addComment(issueKey: string, body: AdfDocument): Promise<void>;
  addRemoteLink(issueKey: string, link: RemoteLink): Promise<void>;
  searchIssues(jql: string, limit: number): Promise<JiraIssueSummary[]>;
  listProjects(): Promise<JiraProject[]>;
}

const issueSchema = z.object({ key: z.string() });
const searchSchema = z.object({ issues: z.array(z.unknown()) });
const issueRowSchema = z.object({
  key: z.string(),
  fields: z.object({
    summary: z.string(),
    status: z.object({ name: z.string() }),
    project: z.object({ key: z.string(), name: z.string() }),
  }),
});
const projectsSchema = z.object({
  values: z.array(z.object({ key: z.string(), name: z.string() })),
});

const CREDENTIALS_REJECTED = "Jira rejected the saved credentials. Ask the owner to reconnect";

function unavailable(): ApiError {
  return new ApiError("upstream", "Jira could not be reached");
}

function rejected(status: number): ApiError {
  return new ApiError("upstream", `Jira responded with HTTP ${String(status)}`);
}

function throwIfDenied(status: number, notFound: string, forbidden: string): void {
  if (status === 404) {
    throw new ApiError("not_found", notFound);
  }
  if (status === 401) {
    throw new ApiError("not_configured", CREDENTIALS_REJECTED);
  }
  if (status === 403) {
    throw new ApiError("forbidden", forbidden);
  }
}

function basicAuthorization(email: string, token: string): string {
  const bytes = new TextEncoder().encode(`${email}:${token}`);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return `Basic ${btoa(binary)}`;
}

export function createJiraClient(options: JiraClientOptions): JiraClient {
  const base = options.baseUrl.replace(/\/+$/, "");
  const authorization = basicAuthorization(options.email, options.token);

  async function send(path: string, init: { method?: string; body?: string } = {}) {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: authorization,
    };
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    try {
      return await options.fetch(`${base}${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.body ?? null,
        signal: AbortSignal.timeout(JIRA_TIMEOUT_MS),
      });
    } catch {
      throw unavailable();
    }
  }

  async function readOk(response: Response): Promise<unknown> {
    if (!response.ok) {
      throw rejected(response.status);
    }
    try {
      return await response.json();
    } catch {
      throw rejected(response.status);
    }
  }

  return {
    async verifyCredentials() {
      const response = await send("/rest/api/3/myself");
      if (response.status === 401 || response.status === 403) {
        return false;
      }
      await readOk(response);
      return true;
    },

    async getIssue(issueKey) {
      const response = await send(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary`,
      );
      throwIfDenied(
        response.status,
        "The Jira issue was not found",
        "The Jira account cannot see this issue",
      );
      const result = z.safeParse(issueSchema, await readOk(response));
      if (!result.success) {
        throw new ApiError("upstream", "Jira returned an unexpected response");
      }
      return result.data;
    },

    async addComment(issueKey, body) {
      const response = await send(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      await readOk(response);
    },

    async addRemoteLink(issueKey, link) {
      const response = await send(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/remotelink`, {
        method: "POST",
        body: JSON.stringify({
          globalId: link.globalId,
          object: { url: link.url, title: link.title },
        }),
      });
      await readOk(response);
    },

    async searchIssues(jql, limit) {
      const query = new URLSearchParams({
        jql,
        fields: "summary,status,project",
        maxResults: String(limit),
      });
      const response = await send(`/rest/api/3/search/jql?${query.toString()}`);
      throwIfDenied(
        response.status,
        "The Jira site was not found",
        "The Jira account cannot search issues",
      );
      const result = z.safeParse(searchSchema, await readOk(response));
      if (!result.success) {
        throw new ApiError("upstream", "Jira returned an unexpected response");
      }
      return result.data.issues.flatMap((row) => {
        const issue = z.safeParse(issueRowSchema, row);
        return issue.success
          ? [
              {
                key: issue.data.key,
                summary: issue.data.fields.summary,
                status: issue.data.fields.status.name,
                projectKey: issue.data.fields.project.key,
                projectName: issue.data.fields.project.name,
              },
            ]
          : [];
      });
    },

    async listProjects() {
      const response = await send("/rest/api/3/project/search?maxResults=100&orderBy=name");
      throwIfDenied(
        response.status,
        "The Jira site was not found",
        "The Jira account cannot list projects",
      );
      const result = z.safeParse(projectsSchema, await readOk(response));
      if (!result.success) {
        throw new ApiError("upstream", "Jira returned an unexpected response");
      }
      return result.data.values;
    },
  };
}
