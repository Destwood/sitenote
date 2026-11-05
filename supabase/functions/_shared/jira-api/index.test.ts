import { describe, expect, it, vi } from "vitest";

import { buildLinkComment } from "../jira-issue/index.ts";

import { createJiraClient } from "./index.ts";

function respond(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function clientWith(
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
  token = "api-token",
) {
  const fetchMock = vi.fn(fetchImpl);
  const client = createJiraClient({
    baseUrl: "https://jira.test/",
    email: "user@example.com",
    token,
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { client, fetchMock };
}

describe("createJiraClient", () => {
  it("sends basic authentication against the trimmed base url", async () => {
    const { client, fetchMock } = clientWith(() => respond({ accountId: "1" }));
    expect(await client.verifyCredentials()).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://jira.test/rest/api/3/myself");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      `Basic ${btoa("user@example.com:api-token")}`,
    );
  });

  it("encodes non latin1 credentials as utf-8 before base64", async () => {
    const { client, fetchMock } = clientWith(() => respond({ accountId: "1" }), "токен");
    await client.verifyCredentials();
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const encoded = new Headers(init?.headers).get("Authorization") ?? "";
    const bytes = Uint8Array.from(atob(encoded.replace("Basic ", "")), (char) =>
      char.charCodeAt(0),
    );
    expect(new TextDecoder().decode(bytes)).toBe("user@example.com:токен");
  });

  it("reports rejected credentials as false instead of throwing", async () => {
    const unauthorized = clientWith(() => respond({ errorMessages: ["bad"] }, 401));
    expect(await unauthorized.client.verifyCredentials()).toBe(false);
    const forbidden = clientWith(() => respond({}, 403));
    expect(await forbidden.client.verifyCredentials()).toBe(false);
  });

  it("maps other verification failures and network errors to upstream errors", async () => {
    const failing = clientWith(() => respond({}, 500));
    await expect(failing.client.verifyCredentials()).rejects.toMatchObject({ code: "upstream" });

    const offline = clientWith(() => Promise.reject(new TypeError("fetch failed")));
    await expect(offline.client.getIssue("PROJ-1")).rejects.toMatchObject({ code: "upstream" });
  });

  it("returns the key of an existing issue", async () => {
    const { client, fetchMock } = clientWith(() => respond({ key: "PROJ-1", id: "10001" }));
    expect(await client.getIssue("PROJ-1")).toEqual({ key: "PROJ-1" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://jira.test/rest/api/3/issue/PROJ-1?fields=summary",
    );
  });

  it.each([
    [404, "not_found"],
    [401, "not_configured"],
    [403, "forbidden"],
    [500, "upstream"],
    [429, "upstream"],
  ])("maps a Jira %i on issue lookup to %s", async (status, code) => {
    const { client } = clientWith(() => respond({ errorMessages: ["x"] }, status));
    await expect(client.getIssue("PROJ-1")).rejects.toMatchObject({ code });
  });

  it("rejects an issue response without a key", async () => {
    const { client } = clientWith(() => respond({ id: "10001" }));
    await expect(client.getIssue("PROJ-1")).rejects.toMatchObject({ code: "upstream" });
  });

  it("posts the comment body as the adf document", async () => {
    const { client, fetchMock } = clientWith(() => respond({ id: "1" }, 201));
    const body = buildLinkComment("https://app.sitenote.test/t/1");
    await client.addComment("PROJ-1", body);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://jira.test/rest/api/3/issue/PROJ-1/comment");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ body });
  });

  it("surfaces a rejected comment as an upstream error", async () => {
    const { client } = clientWith(() => respond({}, 400));
    await expect(client.addComment("PROJ-1", buildLinkComment("https://x"))).rejects.toMatchObject({
      code: "upstream",
    });
  });
});
