import { ApiError, jsonResponse } from "../_shared/api/index.ts";
import { createClickUpClient } from "../_shared/clickup-api/index.ts";
import { endpoint, type EnvMap } from "../_shared/runtime/index.ts";
import { hierarchyBody, parseRequest, readJsonBody } from "../_shared/requests/index.ts";
import {
  authenticate,
  bearerToken,
  clickUpApiBase,
  loadIntegration,
  readToken,
  requireOwner,
  serviceClient,
  userClient,
} from "../_shared/supabase/index.ts";

export function handleHierarchy(
  request: Request,
  env: EnvMap,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return endpoint(request, env, async (cors) => {
    const token = bearerToken(request);
    const body = parseRequest(hierarchyBody, await readJsonBody(request));
    const user = userClient(env, token, fetchImpl);
    const userId = await authenticate(user, token);
    await requireOwner(user, body.workspaceId, userId);

    const clickUpToken = body.token ?? (await storedToken(env, fetchImpl, body.workspaceId));
    const clickUp = createClickUpClient({
      baseUrl: clickUpApiBase(env),
      token: clickUpToken,
      fetch: fetchImpl,
    });

    const teams = await clickUp.listTeams();
    const spaces = body.teamId === undefined ? undefined : await clickUp.listSpaces(body.teamId);
    const lists = body.spaceId === undefined ? undefined : await clickUp.listLists(body.spaceId);
    return jsonResponse({ teams, spaces, lists }, 200, cors);
  });
}

async function storedToken(
  env: EnvMap,
  fetchImpl: typeof fetch,
  workspaceId: string,
): Promise<string> {
  const service = serviceClient(env, fetchImpl);
  const integration = await loadIntegration(service, workspaceId);
  if (integration === null || integration.secretId === null) {
    throw new ApiError("not_configured", "Enter a ClickUp token to load the lists");
  }
  const stored = await readToken(service, integration.secretId);
  if (stored === null) {
    throw new ApiError("not_configured", "The ClickUp token of this workspace is missing");
  }
  return stored;
}
