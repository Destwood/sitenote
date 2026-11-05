import { ApiError, jsonResponse } from "../_shared/api/index.ts";
import { createJiraClient, type JiraClient } from "../_shared/jira-api/index.ts";
import { buildLinkComment, decideIssueLink, issueUrl } from "../_shared/jira-issue/index.ts";
import {
  describeError,
  endpoint,
  requireEnv,
  type Cors,
  type EnvMap,
} from "../_shared/runtime/index.ts";
import {
  linkIssueBody,
  parseJiraSettings,
  parseRequest,
  readJsonBody,
} from "../_shared/requests/index.ts";
import {
  authenticate,
  bearerToken,
  jiraApiBase,
  loadIntegration,
  loadThread,
  readToken,
  roleIn,
  serviceClient,
  userClient,
} from "../_shared/supabase/index.ts";
import { threadLink } from "../_shared/thread-link/index.ts";

export function handleLinkIssue(
  request: Request,
  env: EnvMap,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return endpoint(request, env, async (cors) => {
    const token = bearerToken(request);
    const { threadId, issueKey } = parseRequest(linkIssueBody, await readJsonBody(request));
    const user = userClient(env, token, fetchImpl);
    const userId = await authenticate(user, token);
    const thread = await loadThread(user, threadId);
    const role = await roleIn(user, thread.workspace_id, userId);
    if (role === null) {
      throw new ApiError("not_found", "The comment was not found");
    }
    if (role === "guest") {
      throw new ApiError("forbidden", "Guests cannot link Jira issues");
    }

    const decision = decideIssueLink({
      jiraIssueKey: thread.jira_issue_key,
      jiraIssueUrl: thread.jira_issue_url,
    });
    if (decision.kind === "existing") {
      return linkResponse(decision.issueKey, decision.issueUrl, false, false, cors);
    }

    const service = serviceClient(env, fetchImpl);
    const integration = await loadIntegration(service, thread.workspace_id, "jira");
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

    const issue = await jira.getIssue(issueKey);
    if (issue.key.toUpperCase() !== issueKey) {
      throw new ApiError("upstream", "Jira returned an unexpected response");
    }
    const url = issueUrl(settings.siteUrl, issueKey);

    const { error } = await service
      .from("threads")
      .update({ jira_issue_key: issueKey, jira_issue_url: url })
      .eq("id", threadId)
      .is("jira_issue_key", null);
    if (error !== null) {
      throw new Error(error.message);
    }

    const commentAdded = await addLinkComment(
      jira,
      issueKey,
      threadLink(requireEnv(env, "SITE_URL"), threadId),
    );
    return linkResponse(issueKey, url, true, commentAdded, cors);
  });
}

async function addLinkComment(
  jira: JiraClient,
  issueKey: string,
  deepLink: string,
): Promise<boolean> {
  try {
    await jira.addComment(issueKey, buildLinkComment(deepLink));
    return true;
  } catch (error) {
    console.error(describeError(error));
    return false;
  }
}

function linkResponse(
  issueKey: string,
  link: string,
  linked: boolean,
  commentAdded: boolean,
  cors: Cors,
): Response {
  return jsonResponse({ issueKey, issueUrl: link, linked, commentAdded }, 200, cors);
}
