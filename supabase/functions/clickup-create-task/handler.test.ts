import { assertEquals, assertStringIncludes } from "@std/assert";

import { fakeBackend, json, single, type RecordedRequest } from "../_shared/testing/index.ts";

import { handleCreateTask } from "./handler.ts";

const OWNER_ID = "20000000-0000-4000-8000-000000000001";
const GUEST_ID = "20000000-0000-4000-8000-000000000002";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const SECRET_ID = "40000000-0000-4000-8000-000000000001";

const env = {
  SUPABASE_URL: "https://project.test",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SITE_URL: "https://app.sitenote.test",
  CLICKUP_API_BASE: "https://clickup.test",
};

interface Scenario {
  userId?: string;
  role?: "owner" | "member" | "guest";
  taskId?: string;
  screenshot?: string;
  integration?: boolean;
}

function request(): Request {
  return new Request("https://functions.test/clickup-create-task", {
    method: "POST",
    headers: { Authorization: "Bearer user-jwt", "Content-Type": "application/json" },
    body: JSON.stringify({ threadId: THREAD_ID }),
  });
}

function backendFor(scenario: Scenario) {
  return fakeBackend((req: RecordedRequest) => {
    const path = req.url.pathname;
    if (path === "/auth/v1/user") {
      return json({ id: scenario.userId ?? OWNER_ID, aud: "authenticated" });
    }
    if (path === "/rest/v1/threads" && req.method === "GET") {
      return single({
        id: THREAD_ID,
        workspace_id: WORKSPACE_ID,
        page_url: "https://example.com/pricing",
        context: {},
        screenshot_path: scenario.screenshot ?? null,
        clickup_task_id: scenario.taskId ?? null,
        clickup_task_url:
          scenario.taskId === undefined ? null : `https://app.clickup.com/t/${scenario.taskId}`,
      });
    }
    if (path === "/rest/v1/threads" && req.method === "PATCH") {
      return new Response(null, { status: 204 });
    }
    if (path === "/rest/v1/members") {
      return single({ role: scenario.role ?? "owner" });
    }
    if (path === "/rest/v1/comments") {
      return single({ body: "Button is misaligned" });
    }
    if (path === "/rest/v1/integrations") {
      if (scenario.integration === false) {
        return single(null, false);
      }
      return single({
        secret_id: SECRET_ID,
        settings: {
          teamId: "1",
          teamName: "T",
          spaceId: "2",
          spaceName: "S",
          listId: "789",
          listName: "L",
        },
      });
    }
    if (path === "/rest/v1/rpc/integration_secret_read") {
      return json("pk_1_token");
    }
    if (path.startsWith("/storage/v1/object/screenshots/")) {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }
    if (path === "/api/v2/list/789/task") {
      return json({ id: "86abc", url: "https://app.clickup.test/t/86abc" });
    }
    if (path === "/api/v2/task/86abc/attachment") {
      return json({ id: "att" });
    }
    return undefined;
  });
}

function clickUpCalls(requests: RecordedRequest[]): RecordedRequest[] {
  return requests.filter((req) => req.url.host === "clickup.test");
}

Deno.test("returns the existing task without calling ClickUp", async () => {
  const backend = backendFor({ taskId: "86old" });
  const response = await handleCreateTask(request(), env, backend.fetch);
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    taskId: "86old",
    taskUrl: "https://app.clickup.com/t/86old",
    created: false,
    screenshotAttached: false,
  });
  assertEquals(clickUpCalls(backend.requests).length, 0);
});

Deno.test(
  "creates the task, attaches the screenshot and saves the link on the thread",
  async () => {
    const backend = backendFor({ screenshot: `${WORKSPACE_ID}/${THREAD_ID}.webp` });
    const response = await handleCreateTask(request(), env, backend.fetch);
    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.taskId, "86abc");
    assertEquals(body.created, true);
    assertEquals(body.screenshotAttached, true);
    const create = clickUpCalls(backend.requests).find(
      (req) => req.url.pathname === "/api/v2/list/789/task",
    );
    assertStringIncludes(create?.body ?? "", "Button is misaligned");
    const save = backend.requests.find((req) => req.method === "PATCH");
    assertStringIncludes(save?.body ?? "", "86abc");
  },
);

Deno.test("refuses guests before any ClickUp call", async () => {
  const backend = backendFor({ role: "guest", userId: GUEST_ID });
  const response = await handleCreateTask(request(), env, backend.fetch);
  assertEquals(response.status, 403);
  assertEquals(clickUpCalls(backend.requests).length, 0);
});

Deno.test("answers not_configured when the workspace has no ClickUp integration", async () => {
  const backend = backendFor({ integration: false });
  const response = await handleCreateTask(request(), env, backend.fetch);
  assertEquals(response.status, 409);
  assertEquals((await response.json()).error.code, "not_configured");
});

Deno.test("answers unauthorized without a bearer token", async () => {
  const backend = backendFor({});
  const response = await handleCreateTask(
    new Request("https://functions.test/clickup-create-task", { method: "POST", body: "{}" }),
    env,
    backend.fetch,
  );
  assertEquals(response.status, 401);
  assertEquals(backend.requests.length, 0);
});
