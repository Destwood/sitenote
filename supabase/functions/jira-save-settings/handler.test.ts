import { assertEquals, assertFalse, assertStringIncludes } from "@std/assert";

import { fakeBackend, json, single, type RecordedRequest } from "../_shared/testing/index.ts";

import { handleSaveSettings } from "./handler.ts";

const OWNER_ID = "20000000-0000-4000-8000-000000000001";
const MEMBER_ID = "20000000-0000-4000-8000-000000000004";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const SECRET_ID = "40000000-0000-4000-8000-000000000001";
const NEW_TOKEN = "jira-new-token-value";
const STORED_TOKEN = "jira-stored-token-value";

const env = {
  SUPABASE_URL: "https://project.test",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SITE_URL: "https://app.sitenote.test",
  JIRA_API_BASE: "https://jira.test",
};

const body = {
  workspaceId: WORKSPACE_ID,
  siteUrl: "https://org.atlassian.net",
  email: "user@example.com",
  token: NEW_TOKEN,
};

interface Scenario {
  userId?: string;
  role?: "owner" | "member" | "guest";
  existing?: boolean;
  tokenAccepted?: boolean;
}

function request(payload: unknown): Request {
  return new Request("https://functions.test/jira-save-settings", {
    method: "POST",
    headers: { Authorization: "Bearer user-jwt", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function backendFor(scenario: Scenario) {
  return fakeBackend((req: RecordedRequest) => {
    const path = req.url.pathname;
    if (req.url.host === "jira.test") {
      if (path === "/rest/api/3/myself") {
        return scenario.tokenAccepted === false
          ? json({ errorMessages: ["bad"] }, 401)
          : json({ accountId: "1" });
      }
      return undefined;
    }
    if (path === "/auth/v1/user") {
      return json({ id: scenario.userId ?? OWNER_ID, aud: "authenticated" });
    }
    if (path === "/rest/v1/members") {
      return single({ role: scenario.role ?? "owner" });
    }
    if (path === "/rest/v1/integrations" && req.method === "POST") {
      return new Response(null, { status: 201 });
    }
    if (path === "/rest/v1/integrations") {
      if (scenario.existing === false) {
        return single(null, false);
      }
      return single({ secret_id: SECRET_ID, settings: {} });
    }
    if (path === "/rest/v1/rpc/integration_secret_read") {
      return json(STORED_TOKEN);
    }
    if (path === "/rest/v1/rpc/integration_secret_upsert") {
      return json(SECRET_ID);
    }
    return undefined;
  });
}

function jiraCalls(requests: RecordedRequest[]): RecordedRequest[] {
  return requests.filter((req) => req.url.host === "jira.test");
}

function savedIntegration(requests: RecordedRequest[]): RecordedRequest | undefined {
  return requests.find(
    (req) => req.url.pathname === "/rest/v1/integrations" && req.method === "POST",
  );
}

Deno.test("lets the owner save a verified token and the normalized site", async () => {
  const backend = backendFor({});
  const response = await handleSaveSettings(
    request({ ...body, siteUrl: "HTTPS://Org.Atlassian.NET/" }),
    env,
    backend.fetch,
  );
  assertEquals(response.status, 200);
  const text = await response.text();
  assertEquals(JSON.parse(text), { connected: true });
  assertFalse(text.includes(NEW_TOKEN));

  const upsert = backend.requests.find(
    (req) => req.url.pathname === "/rest/v1/rpc/integration_secret_upsert",
  );
  assertStringIncludes(upsert?.body ?? "", NEW_TOKEN);
  assertStringIncludes(upsert?.body ?? "", '"p_provider":"jira"');

  const save = savedIntegration(backend.requests);
  assertStringIncludes(save?.body ?? "", '"provider":"jira"');
  assertStringIncludes(save?.body ?? "", '"siteUrl":"https://org.atlassian.net"');
  assertStringIncludes(save?.body ?? "", '"email":"user@example.com"');
  assertStringIncludes(save?.body ?? "", SECRET_ID);
});

Deno.test("verifies a typed token against the site with basic authentication", async () => {
  const backend = backendFor({});
  await handleSaveSettings(request(body), env, backend.fetch);
  const verify = jiraCalls(backend.requests)[0];
  assertEquals(verify?.url.pathname, "/rest/api/3/myself");
  assertEquals(
    verify?.headers.get("Authorization"),
    `Basic ${btoa(`user@example.com:${NEW_TOKEN}`)}`,
  );
});

Deno.test("reuses the stored token when none is typed and keeps the same secret", async () => {
  const backend = backendFor({});
  const withoutToken = { workspaceId: WORKSPACE_ID, siteUrl: body.siteUrl, email: body.email };
  const response = await handleSaveSettings(request(withoutToken), env, backend.fetch);
  assertEquals(response.status, 200);

  const verify = jiraCalls(backend.requests)[0];
  assertEquals(
    verify?.headers.get("Authorization"),
    `Basic ${btoa(`user@example.com:${STORED_TOKEN}`)}`,
  );
  assertEquals(
    backend.requests.some((req) => req.url.pathname === "/rest/v1/rpc/integration_secret_upsert"),
    false,
  );
  assertStringIncludes(savedIntegration(backend.requests)?.body ?? "", SECRET_ID);
});

Deno.test("asks for a token when none is typed and none is stored", async () => {
  const backend = backendFor({ existing: false });
  const withoutToken = { workspaceId: WORKSPACE_ID, siteUrl: body.siteUrl, email: body.email };
  const response = await handleSaveSettings(request(withoutToken), env, backend.fetch);
  assertEquals(response.status, 400);
  assertEquals((await response.json()).error.code, "validation");
  assertEquals(jiraCalls(backend.requests).length, 0);
  assertEquals(savedIntegration(backend.requests), undefined);
});

Deno.test("denies a member before calling Jira", async () => {
  const backend = backendFor({ userId: MEMBER_ID, role: "member" });
  const response = await handleSaveSettings(request(body), env, backend.fetch);
  assertEquals(response.status, 403);
  assertEquals((await response.json()).error.code, "forbidden");
  assertEquals(jiraCalls(backend.requests).length, 0);
});

Deno.test("rejects a site that is not a bare atlassian https origin", async () => {
  const siteUrls = [
    "http://org.atlassian.net",
    "https://evil.com",
    "https://org.atlassian.net.evil.com",
    "https://org.atlassian.net:8443",
    "https://user@org.atlassian.net",
    "https://user:secret@org.atlassian.net",
    "https://org.atlassian.net/browse/PROJ-1",
    "https://org.atlassian.net?next=1",
    "not a url",
  ];
  for (const siteUrl of siteUrls) {
    const backend = backendFor({});
    const response = await handleSaveSettings(request({ ...body, siteUrl }), env, backend.fetch);
    assertEquals(response.status, 400);
    assertEquals((await response.json()).error.code, "validation");
    assertEquals(jiraCalls(backend.requests).length, 0);
    assertEquals(savedIntegration(backend.requests), undefined);
  }
});

Deno.test("rejects credentials that Jira does not accept and stores nothing", async () => {
  const backend = backendFor({ tokenAccepted: false });
  const response = await handleSaveSettings(request(body), env, backend.fetch);
  assertEquals(response.status, 400);
  const failure = await response.json();
  assertEquals(failure.error.code, "validation");
  assertEquals(failure.error.message, "Jira rejected these credentials");
  assertEquals(
    backend.requests.some((req) => req.url.pathname === "/rest/v1/rpc/integration_secret_upsert"),
    false,
  );
  assertEquals(savedIntegration(backend.requests), undefined);
});

Deno.test("rejects a malformed body before any call", async () => {
  const backend = backendFor({});
  const response = await handleSaveSettings(
    request({ ...body, email: "not-an-email" }),
    env,
    backend.fetch,
  );
  assertEquals(response.status, 400);
  assertEquals(backend.requests.length, 0);
});
