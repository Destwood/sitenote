import * as z from "zod/mini";

import { ApiError } from "../api";

export const CLICKUP_TIMEOUT_MS = 10_000;

export interface ClickUpItem {
  id: string;
  name: string;
}

export interface ClickUpTask {
  id: string;
  url: string;
}

export interface ClickUpClientOptions {
  baseUrl: string;
  token: string;
  fetch: typeof fetch;
}

export interface ClickUpClient {
  verifyToken(): Promise<boolean>;
  listTeams(): Promise<ClickUpItem[]>;
  listSpaces(teamId: string): Promise<ClickUpItem[]>;
  listLists(spaceId: string): Promise<ClickUpItem[]>;
  createTask(
    listId: string,
    task: { name: string; markdownDescription: string },
  ): Promise<ClickUpTask>;
  attachFile(taskId: string, file: Blob, fileName: string): Promise<void>;
}

const itemSchema = z.object({ id: z.string(), name: z.string() });
const teamsSchema = z.object({ teams: z.array(itemSchema) });
const spacesSchema = z.object({ spaces: z.array(itemSchema) });
const listsSchema = z.object({ lists: z.array(itemSchema) });
const taskSchema = z.object({ id: z.string(), url: z.string() });

function unavailable(): ApiError {
  return new ApiError("upstream", "ClickUp could not be reached");
}

function rejected(status: number): ApiError {
  return new ApiError("upstream", `ClickUp responded with HTTP ${String(status)}`);
}

export function createClickUpClient(options: ClickUpClientOptions): ClickUpClient {
  const base = options.baseUrl.replace(/\/+$/, "");

  async function send(
    path: string,
    init: { method?: string; body?: string | FormData; json?: boolean } = {},
  ) {
    const headers: Record<string, string> = { Authorization: options.token };
    if (init.json === true) {
      headers["Content-Type"] = "application/json";
    }
    try {
      return await options.fetch(`${base}${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.body ?? null,
        signal: AbortSignal.timeout(CLICKUP_TIMEOUT_MS),
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

  function parse<T extends z.ZodMiniType>(schema: T, value: unknown): z.output<T> {
    const result = z.safeParse(schema, value);
    if (!result.success) {
      throw new ApiError("upstream", "ClickUp returned an unexpected response");
    }
    return result.data;
  }

  return {
    async verifyToken() {
      const response = await send("/api/v2/user");
      if (response.status === 401 || response.status === 403) {
        return false;
      }
      await readOk(response);
      return true;
    },

    async listTeams() {
      const data = parse(teamsSchema, await readOk(await send("/api/v2/team")));
      return data.teams;
    },

    async listSpaces(teamId) {
      const response = await send(`/api/v2/team/${encodeURIComponent(teamId)}/space`);
      return parse(spacesSchema, await readOk(response)).spaces;
    },

    async listLists(spaceId) {
      const response = await send(`/api/v2/space/${encodeURIComponent(spaceId)}/list`);
      return parse(listsSchema, await readOk(response)).lists;
    },

    async createTask(listId, task) {
      const response = await send(`/api/v2/list/${encodeURIComponent(listId)}/task`, {
        method: "POST",
        json: true,
        body: JSON.stringify({ name: task.name, markdown_description: task.markdownDescription }),
      });
      const created = parse(taskSchema, await readOk(response));
      if (!created.url.startsWith("https://")) {
        throw new ApiError("upstream", "ClickUp returned an unexpected task link");
      }
      return created;
    },

    async attachFile(taskId, file, fileName) {
      const form = new FormData();
      form.append("attachment", file, fileName);
      const response = await send(`/api/v2/task/${encodeURIComponent(taskId)}/attachment`, {
        method: "POST",
        body: form,
      });
      await readOk(response);
    },
  };
}
