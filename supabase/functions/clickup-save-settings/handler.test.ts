import { assertEquals, assertStringIncludes } from "@std/assert";

import { fakeBackend, json, single, type RecordedRequest } from "../_shared/testing/index.ts";

import { handleSaveSettings } from "./handler.ts";

const OWNER_ID = "20000000-0000-4000-8000-000000000001";
const MEMBER_ID = "20000000-0000-4000-8000-000000000004";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const SECRET_ID = "40000000-0000-4000-8000-000000000001";

const env = {
  SUPABASE_URL: "https://project.test",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SITE_URL: "https://app.sitenote.test",
  CLICKUP_API_BASE: "https://clickup.test",
};

const body = {
  workspaceId: WORKSPACE_ID,
  token: "pk_1_new",
  teamId: "1",
  teamName: "Team",
  spaceId: "2",
  spaceName: "Space",
  listId: "789",
  listName: "List",
};

function request(payload: unknown): Request {
  return new Request("https://functions.test/clickup-save-settings", {
    method: "POST",
    headers: { Authorization: "Bearer user-jwt", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function backendFor(userId: string, role: "owner" | "member", tokenAccepted: boolean) {
  return fakeBackend((req: RecordedRequest) => {
    const path = req.url.pathname;
    if (path === "/auth/v1/user") {
      return json({ id: userId, aud: "authenticated" });
    }
    if (path === "/rest/v1/members") {
      return single({ role });
    }
    if (path === "/rest/v1/integrations" && req.method === "POST") {
      return new Response(null, { status: 201 });
    }
    if (path === "/rest/v1/integrations") {
      return single({ secret_id: SECRET_ID, settings: {} });
    }
    if (path === "/rest/v1/rpc/integration_secret_upsert") {
      return json(SECRET_ID);
    }
    if (path === "/api/v2/user") {
      return tokenAccepted ? json({ user: { id: 1 } }) : json({ err: "bad" }, 401);
    }
    return undefined;
  });
}

Deno.test("lets the owner save a validated token and the chosen list", async () => {
  const backend = backendFor(OWNER_ID, "owner", true);
  const response = await handleSaveSettings(request(body), env, backend.fetch);
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { connected: true });
  const upsert = backend.requests.find(
    (req) => req.url.pathname === "/rest/v1/rpc/integration_secret_upsert",
  );
  assertStringIncludes(upsert?.body ?? "", "pk_1_new");
  const save = backend.requests.find(
    (req) => req.url.pathname === "/rest/v1/integrations" && req.method === "POST",
  );
  assertStringIncludes(save?.body ?? "", '"listId":"789"');
  assertStringIncludes(save?.body ?? "", SECRET_ID);
});

Deno.test("denies a member before calling ClickUp", async () => {
  const backend = backendFor(MEMBER_ID, "member", true);
  const response = await handleSaveSettings(request(body), env, backend.fetch);
  assertEquals(response.status, 403);
  assertEquals(
    backend.requests.some((req) => req.url.host === "clickup.test"),
    false,
  );
});

Deno.test("rejects a token that ClickUp does not accept and stores nothing", async () => {
  const backend = backendFor(OWNER_ID, "owner", false);
  const response = await handleSaveSettings(request(body), env, backend.fetch);
  assertEquals(response.status, 400);
  assertEquals((await response.json()).error.code, "validation");
  assertEquals(
    backend.requests.some((req) => req.url.pathname.includes("integration_secret_upsert")),
    false,
  );
});
