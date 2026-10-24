import { ApiError, jsonResponse } from "../_shared/api/index.ts";
import { createClickUpClient } from "../_shared/clickup-api/index.ts";
import {
  buildTaskDescription,
  buildTaskName,
  decideTaskCreation,
} from "../_shared/clickup-task/index.ts";
import {
  describeError,
  endpoint,
  requireEnv,
  type Cors,
  type EnvMap,
} from "../_shared/runtime/index.ts";
import {
  createTaskBody,
  parseRequest,
  parseStoredSettings,
  readJsonBody,
} from "../_shared/requests/index.ts";
import {
  authenticate,
  bearerToken,
  clickUpApiBase,
  firstCommentBody,
  loadIntegration,
  loadThread,
  readToken,
  roleIn,
  serviceClient,
  userClient,
} from "../_shared/supabase/index.ts";
import { summarizeThreadContext } from "../_shared/thread-context/index.ts";
import { threadLink } from "../_shared/thread-link/index.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClickUpClient } from "../_shared/clickup-api/index.ts";

export function handleCreateTask(
  request: Request,
  env: EnvMap,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return endpoint(request, env, async (cors) => {
    const token = bearerToken(request);
    const { threadId } = parseRequest(createTaskBody, await readJsonBody(request));
    const user = userClient(env, token, fetchImpl);
    const userId = await authenticate(user, token);
    const thread = await loadThread(user, threadId);
    const role = await roleIn(user, thread.workspace_id, userId);
    if (role === null) {
      throw new ApiError("not_found", "The comment was not found");
    }
    if (role === "guest") {
      throw new ApiError("forbidden", "Guests cannot create ClickUp tasks");
    }

    const decision = decideTaskCreation({
      clickUpTaskId: thread.clickup_task_id,
      clickUpTaskUrl: thread.clickup_task_url,
    });
    if (decision.kind === "existing") {
      return taskResponse(decision.taskId, decision.taskUrl, false, false, cors);
    }

    const service = serviceClient(env, fetchImpl);
    const integration = await loadIntegration(service, thread.workspace_id);
    if (integration === null || integration.secretId === null) {
      throw new ApiError("not_configured", "ClickUp is not connected to this workspace");
    }
    const clickUpToken = await readToken(service, integration.secretId);
    if (clickUpToken === null) {
      throw new ApiError("not_configured", "The ClickUp token of this workspace is missing");
    }
    const settings = parseStoredSettings(integration.settings);
    const clickUp = createClickUpClient({
      baseUrl: clickUpApiBase(env),
      token: clickUpToken,
      fetch: fetchImpl,
    });

    const comment = await firstCommentBody(user, threadId);
    const task = await clickUp.createTask(settings.listId, {
      name: buildTaskName(comment),
      markdownDescription: buildTaskDescription({
        pageUrl: thread.page_url,
        firstComment: comment,
        context: summarizeThreadContext(thread.context),
        deepLink: threadLink(requireEnv(env, "SITE_URL"), threadId),
      }),
    });

    const screenshotAttached =
      thread.screenshot_path === null
        ? false
        : await attachScreenshot(service, clickUp, task.id, thread.screenshot_path);

    const { error } = await service
      .from("threads")
      .update({ clickup_task_id: task.id, clickup_task_url: task.url })
      .eq("id", threadId)
      .is("clickup_task_id", null);
    if (error !== null) {
      throw new Error(error.message);
    }
    return taskResponse(task.id, task.url, true, screenshotAttached, cors);
  });
}

async function attachScreenshot(
  service: SupabaseClient,
  clickUp: ClickUpClient,
  taskId: string,
  path: string,
): Promise<boolean> {
  const download = await service.storage.from("screenshots").download(path);
  if (download.error !== null) {
    console.error(`screenshot download failed: ${download.error.message}`);
    return false;
  }
  try {
    await clickUp.attachFile(taskId, download.data, path.split("/").pop() ?? "screenshot.webp");
    return true;
  } catch (error) {
    console.error(describeError(error));
    return false;
  }
}

function taskResponse(
  taskId: string,
  taskUrl: string,
  created: boolean,
  screenshotAttached: boolean,
  cors: Cors,
): Response {
  return jsonResponse({ taskId, taskUrl, created, screenshotAttached }, 200, cors);
}
