import { assertEquals, assertStringIncludes } from "@std/assert";

import { fakeBackend, json, single, type RecordedRequest } from "../_shared/testing/index.ts";

import { handleNotifyEmail } from "./handler.ts";

const NOTIFICATION_ID = "50000000-0000-4000-8000-000000000001";
const RECIPIENT_ID = "20000000-0000-4000-8000-000000000003";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const COMMENT_ID = "60000000-0000-4000-8000-000000000001";

const env = {
  WEBHOOK_SECRET: "webhook-secret-value",
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Sitenote <notify@sitenote.test>",
  SITE_URL: "https://app.sitenote.test",
  SUPABASE_URL: "https://project.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
};

function webhook(secret: string | null): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) {
    headers["X-Webhook-Secret"] = secret;
  }
  const body = { type: "INSERT", table: "notifications", record: { id: NOTIFICATION_ID } };
  return new Request("https://functions.test/notify-email", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function backendFor(email: string | null) {
  return fakeBackend((req: RecordedRequest) => {
    const path = req.url.pathname;
    if (path === "/rest/v1/notifications") {
      return single({
        id: NOTIFICATION_ID,
        user_id: RECIPIENT_ID,
        thread_id: THREAD_ID,
        comment_id: COMMENT_ID,
        kind: "reply",
      });
    }
    if (path === "/rest/v1/profiles") {
      return single({ email, display_name: "Olena Owner" });
    }
    if (path === "/rest/v1/comments") {
      return single({
        body: "Please check <b>this</b>",
        author_id: RECIPIENT_ID,
        deleted_at: null,
      });
    }
    if (path === "/rest/v1/threads") {
      return single({ page_url: "https://example.com/pricing" });
    }
    if (req.url.host === "api.resend.com") {
      return json({ id: "email_1" });
    }
    return undefined;
  });
}

Deno.test("rejects a missing or wrong webhook secret before reading anything", async () => {
  const backend = backendFor("owner@example.com");
  assertEquals((await handleNotifyEmail(webhook(null), env, backend.fetch)).status, 401);
  assertEquals((await handleNotifyEmail(webhook("guess"), env, backend.fetch)).status, 401);
  assertEquals(backend.requests.length, 0);
});

Deno.test("sends one escaped e-mail through Resend", async () => {
  const backend = backendFor("owner@example.com");
  const response = await handleNotifyEmail(webhook("webhook-secret-value"), env, backend.fetch);
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { sent: true });
  const send = backend.requests.find((req) => req.url.host === "api.resend.com");
  assertEquals(send?.headers.get("Authorization"), "Bearer re_test_key");
  assertStringIncludes(send?.body ?? "", "owner@example.com");
  assertStringIncludes(send?.body ?? "", "&lt;b&gt;this&lt;/b&gt;");
});

Deno.test("skips a recipient without an e-mail address", async () => {
  const backend = backendFor(null);
  const response = await handleNotifyEmail(webhook("webhook-secret-value"), env, backend.fetch);
  assertEquals(await response.json(), { skipped: "no_email" });
  assertEquals(
    backend.requests.some((req) => req.url.host === "api.resend.com"),
    false,
  );
});

Deno.test("returns skipped without sending when Resend is not configured", async () => {
  const backend = backendFor("owner@example.com");
  const response = await handleNotifyEmail(
    webhook("webhook-secret-value"),
    { ...env, RESEND_API_KEY: "" },
    backend.fetch,
  );
  assertEquals(await response.json(), { skipped: "not_configured" });
  assertEquals(backend.requests.length, 0);
});
