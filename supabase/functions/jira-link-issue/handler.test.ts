import { assertEquals, assertFalse, assertStringIncludes } from "@std/assert";

import { fakeBackend, json, single, type RecordedRequest } from "../_shared/testing/index.ts";

import { handleLinkIssue } from "./handler.ts";

const OWNER_ID = "20000000-0000-4000-8000-000000000001";
const GUEST_ID = "20000000-0000-4000-8000-000000000002";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const SECRET_ID = "40000000-0000-4000-8000-000000000001";
const JIRA_TOKEN = "jira-api-token-value";

const env = {
  SUPABASE_URL: "https://project.test",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SITE_URL: "https://app.sitenote.test",
  JIRA_API_BASE: "https://jira.test",
};

const validBody = { threadId: THREAD_ID, issueKey: "PROJ-123" };

interface Scenario {
  userId?: string;
  role?: "owner" | "member" | "guest";
  thread?: boolean;
  integration?: boolean;
  linkedKey?: string;
  issueStatus?: number;
  commentStatus?: number;
}

function request(payload: unknown): Request {
  return new Request("https://functions.test/jira-link-issue", {
    method: "POST",
    headers: { Authorization: "Bearer user-jwt", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function backendFor(scenario: Scenario) {
  return fakeBackend((req: RecordedRequest) => {
    const path = req.url.pathname;
    if (req.url.host === "jira.test") {
      if (path === "/rest/api/3/issue/PROJ-123") {
        return json({ key: "PROJ-123" }, scenario.issueStatus ?? 200);
      }
      if (path === "/rest/api/3/issue/PROJ-123/comment") {
        return json({ id: "10" }, scenario.commentStatus ?? 201);
      }
      return undefined;
    }
    if (path === "/auth/v1/user") {
      return json({ id: scenario.userId ?? OWNER_ID, aud: "authenticated" });
    }
    if (path === "/rest/v1/threads" && req.method === "GET") {
      if (scenario.thread === false) {
        return single(null, false);
      }
      return single({
        id: THREAD_ID,
        workspace_id: WORKSPACE_ID,
        page_url: "https://example.com/pricing",
        context: {},
        screenshot_path: null,
        clickup_task_id: null,
        clickup_task_url: null,
        jira_issue_key: scenario.linkedKey ?? null,
        jira_issue_url:
          scenario.linkedKey === undefined
            ? null
            : `https://org.atlassian.net/browse/${scenario.linkedKey}`,
      });
    }
    if (path === "/rest/v1/threads" && req.method === "PATCH") {
      return new Response(null, { status: 204 });
    }
    if (path === "/rest/v1/members") {
      return single({ role: scenario.role ?? "owner" });
    }
    if (path === "/rest/v1/integrations") {
      if (scenario.integration === false) {
        return single(null, false);
      }
      return single({
        secret_id: SECRET_ID,
        settings: { siteUrl: "https://org.atlassian.net", email: "user@example.com" },
      });
    }
    if (path === "/rest/v1/rpc/integration_secret_read") {
      return json(JIRA_TOKEN);
    }
    return undefined;
  });
}

function jiraCalls(requests: RecordedRequest[]): RecordedRequest[] {
  return requests.filter((req) => req.url.host === "jira.test");
}

Deno.test("links the issue, saves it on the thread and comments with the deep link", async () => {
  const backend = backendFor({});
  const response = await handleLinkIssue(request(validBody), env, backend.fetch);
  assertEquals(response.status, 200);
  const text = await response.text();
  assertEquals(JSON.parse(text), {
    issueKey: "PROJ-123",
    issueUrl: "https://org.atlassian.net/browse/PROJ-123",
    linked: true,
    commentAdded: true,
  });
  assertFalse(text.includes(JIRA_TOKEN));

  const save = backend.requests.find((req) => req.method === "PATCH");
  assertStringIncludes(save?.body ?? "", "https://org.atlassian.net/browse/PROJ-123");

  const lookup = jiraCalls(backend.requests).find(
    (req) => req.url.pathname === "/rest/api/3/issue/PROJ-123",
  );
  assertEquals(
    lookup?.headers.get("Authorization"),
    `Basic ${btoa(`user@example.com:${JIRA_TOKEN}`)}`,
  );

  const comment = jiraCalls(backend.requests).find(
    (req) => req.url.pathname === "/rest/api/3/issue/PROJ-123/comment",
  );
  assertStringIncludes(comment?.body ?? "", `https://app.sitenote.test/t/${THREAD_ID}`);
});

Deno.test("lets a member link an issue", async () => {
  const backend = backendFor({ role: "member" });
  const response = await handleLinkIssue(request(validBody), env, backend.fetch);
  assertEquals(response.status, 200);
  assertEquals((await response.json()).linked, true);
});

Deno.test("refuses guests before any Jira call", async () => {
  const backend = backendFor({ role: "guest", userId: GUEST_ID });
  const response = await handleLinkIssue(request(validBody), env, backend.fetch);
  assertEquals(response.status, 403);
  assertEquals((await response.json()).error.code, "forbidden");
  assertEquals(jiraCalls(backend.requests).length, 0);
  assertEquals(
    backend.requests.some((req) => req.method === "PATCH"),
    false,
  );
});

Deno.test("answers not_found when the thread cannot be read", async () => {
  const backend = backendFor({ thread: false });
  const response = await handleLinkIssue(request(validBody), env, backend.fetch);
  assertEquals(response.status, 404);
  assertEquals((await response.json()).error.code, "not_found");
  assertEquals(jiraCalls(backend.requests).length, 0);
});

Deno.test("answers not_configured when the workspace has no Jira integration", async () => {
  const backend = backendFor({ integration: false });
  const response = await handleLinkIssue(request(validBody), env, backend.fetch);
  assertEquals(response.status, 409);
  assertEquals((await response.json()).error.code, "not_configured");
  assertEquals(jiraCalls(backend.requests).length, 0);
});

Deno.test("rejects a malformed issue key before any call", async () => {
  for (const issueKey of ["proj-123", "PROJ-", "PROJ123", "../PROJ-1", "PROJ-1;"]) {
    const backend = backendFor({});
    const response = await handleLinkIssue(
      request({ threadId: THREAD_ID, issueKey }),
      env,
      backend.fetch,
    );
    assertEquals(response.status, 400);
    assertEquals((await response.json()).error.code, "validation");
    assertEquals(backend.requests.length, 0);
  }
});

Deno.test("answers unauthorized without a bearer token", async () => {
  const backend = backendFor({});
  const response = await handleLinkIssue(
    new Request("https://functions.test/jira-link-issue", {
      method: "POST",
      body: JSON.stringify(validBody),
    }),
    env,
    backend.fetch,
  );
  assertEquals(response.status, 401);
  assertEquals(backend.requests.length, 0);
});

Deno.test("maps Jira lookup failures to the documented codes and links nothing", async () => {
  const cases = [
    { issueStatus: 404, code: "not_found", status: 404 },
    { issueStatus: 401, code: "not_configured", status: 409 },
    { issueStatus: 403, code: "forbidden", status: 403 },
    { issueStatus: 500, code: "upstream", status: 502 },
  ];
  for (const { issueStatus, code, status } of cases) {
    const backend = backendFor({ issueStatus });
    const response = await handleLinkIssue(request(validBody), env, backend.fetch);
    assertEquals(response.status, status);
    const failure = await response.json();
    assertEquals(failure.error.code, code);
    assertFalse(JSON.stringify(failure).includes(JIRA_TOKEN));
    assertEquals(
      backend.requests.some((req) => req.method === "PATCH"),
      false,
    );
  }
});

Deno.test("keeps the link when the comment fails and reports commentAdded false", async () => {
  const backend = backendFor({ commentStatus: 500 });
  const response = await handleLinkIssue(request(validBody), env, backend.fetch);
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    issueKey: "PROJ-123",
    issueUrl: "https://org.atlassian.net/browse/PROJ-123",
    linked: true,
    commentAdded: false,
  });
  assertEquals(backend.requests.filter((req) => req.method === "PATCH").length, 1);
});

Deno.test("returns the existing link without calling Jira when the thread is linked", async () => {
  const backend = backendFor({ linkedKey: "PROJ-9" });
  const response = await handleLinkIssue(request(validBody), env, backend.fetch);
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    issueKey: "PROJ-9",
    issueUrl: "https://org.atlassian.net/browse/PROJ-9",
    linked: false,
    commentAdded: false,
  });
  assertEquals(jiraCalls(backend.requests).length, 0);
  assertEquals(
    backend.requests.some((req) => req.method === "PATCH"),
    false,
  );
  assertEquals(
    backend.requests.some((req) => req.url.pathname === "/rest/v1/integrations"),
    false,
  );
});
