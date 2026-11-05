import { ApiError, jsonResponse } from "../_shared/api/index.ts";
import { createJiraClient } from "../_shared/jira-api/index.ts";
import { normalizeJiraSiteUrl } from "../_shared/jira-issue/index.ts";
import { endpoint, type EnvMap } from "../_shared/runtime/index.ts";
import { parseRequest, readJsonBody, saveJiraSettingsBody } from "../_shared/requests/index.ts";
import {
  authenticate,
  bearerToken,
  jiraApiBase,
  loadIntegration,
  readToken,
  requireOwner,
  serviceClient,
  storeToken,
  userClient,
} from "../_shared/supabase/index.ts";

export function handleSaveSettings(
  request: Request,
  env: EnvMap,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return endpoint(request, env, async (cors) => {
    const token = bearerToken(request);
    const body = parseRequest(saveJiraSettingsBody, await readJsonBody(request));
    const user = userClient(env, token, fetchImpl);
    const userId = await authenticate(user, token);
    await requireOwner(user, body.workspaceId, userId, "jira");

    const siteUrl = normalizeJiraSiteUrl(body.siteUrl);
    if (siteUrl === null) {
      throw new ApiError("validation", "Enter a valid https://your-site.atlassian.net address");
    }

    const service = serviceClient(env, fetchImpl);
    const existing = await loadIntegration(service, body.workspaceId, "jira");
    let secretId = existing?.secretId ?? null;

    const apiToken = body.token ?? (secretId === null ? null : await readToken(service, secretId));
    if (apiToken === null) {
      throw new ApiError("validation", "Enter an API token to connect");
    }
    const jira = createJiraClient({
      baseUrl: jiraApiBase(env, siteUrl),
      email: body.email,
      token: apiToken,
      fetch: fetchImpl,
    });
    if (!(await jira.verifyCredentials())) {
      throw new ApiError("validation", "Jira rejected these credentials");
    }
    if (body.token !== undefined) {
      secretId = await storeToken(service, body.workspaceId, body.token, secretId, "jira");
    }

    const { error } = await service.from("integrations").upsert(
      {
        workspace_id: body.workspaceId,
        provider: "jira",
        settings: { siteUrl, email: body.email },
        secret_id: secretId,
      },
      { onConflict: "workspace_id,provider" },
    );
    if (error !== null) {
      throw new Error(error.message);
    }
    return jsonResponse({ connected: true }, 200, cors);
  });
}
