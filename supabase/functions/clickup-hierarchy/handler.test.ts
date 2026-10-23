import { assertEquals } from "@std/assert";

import { fakeBackend, json, single, type RecordedRequest } from "../_shared/testing/index.ts";

import { handleHierarchy } from "./handler.ts";

const OWNER_ID = "20000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const SECRET_ID = "40000000-0000-4000-8000-000000000001";

const env = {
  SUPABASE_URL: "https://project.test",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SITE_URL: "https://app.sitenote.test",
  CLICKUP_API_BASE: "https://clickup.test",
};

function request(payload: unknown): Request {
  return new Request("https://functions.test/clickup-hierarchy", {
    method: "POST",
    headers: { Authorization: "Bearer user-jwt", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

Deno.test(
  "lists the teams, then the spaces and lists of the chosen parents with the stored token",
  async () => {
    const backend = fakeBackend((req: RecordedRequest) => {
      const path = req.url.pathname;
      if (path === "/auth/v1/user") return json({ id: OWNER_ID, aud: "authenticated" });
      if (path === "/rest/v1/members") return single({ role: "owner" });
      if (path === "/rest/v1/integrations") return single({ secret_id: SECRET_ID, settings: {} });
      if (path === "/rest/v1/rpc/integration_secret_read") return json("pk_1_stored");
      if (path === "/api/v2/team") return json({ teams: [{ id: "1", name: "Studio" }] });
      if (path === "/api/v2/team/1/space") return json({ spaces: [{ id: "2", name: "Web" }] });
      if (path === "/api/v2/space/2/list") return json({ lists: [{ id: "789", name: "Bugs" }] });
      return undefined;
    });
    const response = await handleHierarchy(
      request({ workspaceId: WORKSPACE_ID, teamId: "1", spaceId: "2" }),
      env,
      backend.fetch,
    );
    assertEquals(response.status, 200);
    assertEquals(await response.json(), {
      teams: [{ id: "1", name: "Studio" }],
      spaces: [{ id: "2", name: "Web" }],
      lists: [{ id: "789", name: "Bugs" }],
    });
  },
);
