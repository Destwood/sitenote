import { ApiError, jsonResponse } from "../_shared/api/index.ts";
import { createJiraClient } from "../_shared/jira-api/index.ts";
import { buildSearchJql, issueUrl } from "../_shared/jira-issue/index.ts";
import { endpoint, type EnvMap } from "../_shared/runtime/index.ts";
import {
  parseJiraSettings,
  parseRequest,
  readJsonBody,
  searchIssuesBody,
} from "../_shared/requests/index.ts";
import {
  authenticate,
  bearerToken,
  jiraApiBase,
  loadIntegration,
  readToken,
  roleIn,
  serviceClient,
  userClient,
} from "../_shared/supabase/index.ts";

const ISSUE_LIMIT = 20;
const SUMMARY_MAX = 200;

export function handleSearchIssues(
  request: Request,
  env: EnvMap,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return endpoint(request, env, async (cors) => {
    const token = bearerToken(request);
    const { workspaceId, query, projectKey, includeProjects } = parseRequest(
      searchIssuesBody,
      await readJsonBody(request),
    );
    const user = userClient(env, token, fetchImpl);
    const userId = await authenticate(user, token);
    const role = await roleIn(user, workspaceId, userId);
    if (role === null) {
      throw new ApiError("not_found", "The workspace was not found");
    }
    if (role === "guest") {
      throw new ApiError("forbidden", "Guests cannot search Jira issues");
    }

    const service = serviceClient(env, fetchImpl);
    const integration = await loadIntegration(service, workspaceId, "jira");
    if (integration === null || integration.secretId === null) {
      throw new ApiError("not_configured", "Jira is not connected to this workspace");
    }
    const apiToken = await readToken(service, integration.secretId);
    if (apiToken === null) {
      throw new ApiError("not_configured", "The Jira token of this workspace is missing");
    }
    const settings = parseJiraSettings(integration.settings);
    const jira = createJiraClient({
      baseUrl: jiraApiBase(env, settings.siteUrl),
      email: settings.email,
      token: apiToken,
      fetch: fetchImpl,
    });

    const found = await jira.searchIssues(buildSearchJql(query, projectKey), ISSUE_LIMIT);
    const projects = includeProjects ? await jira.listProjects() : [];
    const issues = found.map((issue) => ({
      ...issue,
      summary: issue.summary.slice(0, SUMMARY_MAX),
      url: issueUrl(settings.siteUrl, issue.key),
    }));
    return jsonResponse({ issues, projects }, 200, cors);
  });
}
