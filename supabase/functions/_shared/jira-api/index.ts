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

export interface JiraClient {
  verifyCredentials(): Promise<boolean>;
  getIssue(issueKey: string): Promise<JiraIssue>;
  addComment(issueKey: string, body: AdfDocument): Promise<void>;
}

const issueSchema = z.object({ key: z.string() });

function unavailable(): ApiError {
  return new ApiError("upstream", "Jira could not be reached");
}

function rejected(status: number): ApiError {
  return new ApiError("upstream", `Jira responded with HTTP ${String(status)}`);
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
      if (response.status === 404) {
        throw new ApiError("not_found", "The Jira issue was not found");
      }
      if (response.status === 401) {
        throw new ApiError(
          "not_configured",
          "Jira rejected the saved credentials. Ask the owner to reconnect",
        );
      }
      if (response.status === 403) {
        throw new ApiError("forbidden", "The Jira account cannot see this issue");
      }
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
  };
}
