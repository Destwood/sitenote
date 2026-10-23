import { describe, expect, it, vi } from "vitest";

import { createClickUpClient } from ".";

function respond(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function clientWith(fetchImpl: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(fetchImpl);
  const client = createClickUpClient({
    baseUrl: "https://clickup.test/",
    token: "pk_1_token",
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { client, fetchMock };
}

describe("createClickUpClient", () => {
  it("sends the token as the Authorization header against the trimmed base url", async () => {
    const { client, fetchMock } = clientWith(() => respond({ user: { id: 1 } }));
    expect(await client.verifyToken()).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://clickup.test/api/v2/user");
    expect(new Headers(init?.headers).get("Authorization")).toBe("pk_1_token");
  });

  it("reports a rejected token as false instead of throwing", async () => {
    const { client } = clientWith(() => respond({ err: "Token invalid" }, 401));
    expect(await client.verifyToken()).toBe(false);
  });

  it("maps other failures and network errors to upstream errors", async () => {
    const failing = clientWith(() => respond({}, 500));
    await expect(failing.client.verifyToken()).rejects.toMatchObject({ code: "upstream" });

    const offline = clientWith(() => Promise.reject(new TypeError("fetch failed")));
    await expect(offline.client.listTeams()).rejects.toMatchObject({ code: "upstream" });
  });

  it("lists teams, spaces and lists from the picker endpoints", async () => {
    const teams = clientWith(() => respond({ teams: [{ id: "1", name: "Studio", color: "x" }] }));
    expect(await teams.client.listTeams()).toEqual([{ id: "1", name: "Studio" }]);

    const spaces = clientWith(() => respond({ spaces: [{ id: "2", name: "Web" }] }));
    expect(await spaces.client.listSpaces("1")).toEqual([{ id: "2", name: "Web" }]);
    expect(spaces.fetchMock.mock.calls[0]?.[0]).toBe("https://clickup.test/api/v2/team/1/space");

    const lists = clientWith(() => respond({ lists: [{ id: "3", name: "Bugs" }] }));
    expect(await lists.client.listLists("2")).toEqual([{ id: "3", name: "Bugs" }]);
  });

  it("rejects a response without the expected shape", async () => {
    const { client } = clientWith(() => respond({ teams: [{ id: 1 }] }));
    await expect(client.listTeams()).rejects.toMatchObject({ code: "upstream" });
  });

  it("creates a task in the list with the markdown description", async () => {
    const { client, fetchMock } = clientWith(() =>
      respond({ id: "86abc", url: "https://app.clickup.com/t/86abc" }),
    );
    const task = await client.createTask("789", {
      name: "Name",
      markdownDescription: "**Page:** x",
    });
    expect(task).toEqual({ id: "86abc", url: "https://app.clickup.com/t/86abc" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://clickup.test/api/v2/list/789/task");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      name: "Name",
      markdown_description: "**Page:** x",
    });
  });

  it("refuses a task link that is not https", async () => {
    const { client } = clientWith(() => respond({ id: "86abc", url: "http://evil.test" }));
    await expect(
      client.createTask("789", { name: "Name", markdownDescription: "x" }),
    ).rejects.toMatchObject({ code: "upstream" });
  });

  it("uploads the screenshot as multipart form data", async () => {
    const { client, fetchMock } = clientWith(() => respond({ id: "a" }));
    await client.attachFile("86abc", new Blob(["png"], { type: "image/webp" }), "shot.webp");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://clickup.test/api/v2/task/86abc/attachment");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("attachment")).toBeInstanceOf(File);
  });
});
