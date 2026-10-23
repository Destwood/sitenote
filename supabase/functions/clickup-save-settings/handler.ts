import { ApiError, jsonResponse } from "../_shared/api/index.ts";
import { createClickUpClient } from "../_shared/clickup-api/index.ts";
import { endpoint, type EnvMap } from "../_shared/runtime/index.ts";
import { parseRequest, readJsonBody, saveSettingsBody } from "../_shared/requests/index.ts";
import {
  authenticate,
  bearerToken,
  clickUpApiBase,
  loadIntegration,
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
    const body = parseRequest(saveSettingsBody, await readJsonBody(request));
    const user = userClient(env, token, fetchImpl);
    const userId = await authenticate(user, token);
    await requireOwner(user, body.workspaceId, userId);

    const service = serviceClient(env, fetchImpl);
    const existing = await loadIntegration(service, body.workspaceId);
    let secretId = existing?.secretId ?? null;

    if (body.token !== undefined) {
      const clickUp = createClickUpClient({
        baseUrl: clickUpApiBase(env),
        token: body.token,
        fetch: fetchImpl,
      });
      if (!(await clickUp.verifyToken())) {
        throw new ApiError("validation", "ClickUp rejected this token");
      }
      secretId = await storeToken(service, body.workspaceId, body.token, secretId);
    } else if (secretId === null) {
      throw new ApiError("validation", "Enter a ClickUp token to connect");
    }

    const { error } = await service.from("integrations").upsert(
      {
        workspace_id: body.workspaceId,
        provider: "clickup",
        settings: {
          teamId: body.teamId,
          teamName: body.teamName,
          spaceId: body.spaceId,
          spaceName: body.spaceName,
          listId: body.listId,
          listName: body.listName,
        },
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
