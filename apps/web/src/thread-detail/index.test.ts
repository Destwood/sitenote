import type { SitenoteClient } from "@sitenote/db";
import { describe, expect, it, vi } from "vitest";

import { FORMER_MEMBER_LABEL } from "../thread-table";
import { readThreadDetail } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "20000000-0000-4000-8000-000000000001";
const OLENA = "00000000-0000-4000-8000-000000000001";

const THREAD = {
  id: THREAD_ID,
  workspace_id: WORKSPACE_ID,
  page_url: "https://example.test/pricing",
  status: "open",
  created_at: "2026-10-22T09:00:00Z",
  created_by: OLENA,
  resolved_at: null,
  screenshot_path: null,
  context: {},
};

const COMMENTS = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    author_id: OLENA,
    body: "Hello @Max",
    mentions: ["00000000-0000-4000-8000-000000000002"],
    created_at: "2026-10-22T09:00:00Z",
    edited_at: null,
    deleted_at: null,
  },
];

const MEMBERS = [
  {
    user_id: OLENA,
    role: "owner",
    created_at: "2026-10-01T09:00:00Z",
    profiles: { display_name: "Olena" },
  },
  {
    user_id: "00000000-0000-4000-8000-000000000002",
    role: "member",
    created_at: "2026-10-02T09:00:00Z",
    profiles: { display_name: "Max" },
  },
];

interface Result {
  data: unknown;
  error: unknown;
}

function fakeClient(tables: Record<string, Result>, filters: string[] = []) {
  const from = vi.fn((table: string) => {
    const result = tables[table] ?? { data: [], error: null };
    const chain = {
      select: () => chain,
      eq: (column: string) => {
        filters.push(`${table}.${column}`);
        return chain;
      },
      order: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
    };
    return chain;
  });
  const createSignedUrl = vi.fn(() =>
    Promise.resolve({ data: { signedUrl: "https://storage.example.test/shot.webp" }, error: null }),
  );
  const client = {
    from,
    storage: { from: () => ({ createSignedUrl }) },
  };
  return { client: client as unknown as SitenoteClient, from, createSignedUrl };
}

function tables(thread: Result, comments: Result = { data: COMMENTS, error: null }) {
  return {
    threads: thread,
    comments,
    members: { data: MEMBERS, error: null },
  };
}

describe("readThreadDetail", () => {
  it("returns null when the thread is not readable", async () => {
    const { client } = fakeClient(tables({ data: null, error: null }));

    expect(await readThreadDetail(client, THREAD_ID)).toBeNull();
  });

  it("fails when the thread cannot be read", async () => {
    const { client } = fakeClient(tables({ data: null, error: { message: "down" } }));

    await expect(readThreadDetail(client, THREAD_ID)).rejects.toThrow("Could not read the thread.");
  });

  it("fails when the comments cannot be read", async () => {
    const { client } = fakeClient(
      tables({ data: THREAD, error: null }, { data: null, error: { message: "down" } }),
    );

    await expect(readThreadDetail(client, THREAD_ID)).rejects.toThrow(
      "Could not read the comments.",
    );
  });

  it("limits the thread to the workspace when one is given", async () => {
    const filters: string[] = [];
    const { client } = fakeClient(tables({ data: THREAD, error: null }), filters);

    await readThreadDetail(client, THREAD_ID, WORKSPACE_ID);

    expect(filters).toContain("threads.workspace_id");
  });

  it("reads the thread by id alone when no workspace is given", async () => {
    const filters: string[] = [];
    const { client } = fakeClient(tables({ data: THREAD, error: null }), filters);

    await readThreadDetail(client, THREAD_ID);

    expect(filters).not.toContain("threads.workspace_id");
  });

  it("maps the thread, its author and its comments", async () => {
    const { client } = fakeClient(
      tables({
        data: { ...THREAD, resolved_at: "2026-10-22T11:00:00Z", status: "resolved" },
        error: null,
      }),
    );

    const detail = await readThreadDetail(client, THREAD_ID);

    expect(detail).toMatchObject({
      id: THREAD_ID,
      workspaceId: WORKSPACE_ID,
      pageUrl: "https://example.test/pricing",
      status: "resolved",
      createdAt: "2026-10-22T09:00:00Z",
      resolvedAt: "2026-10-22T11:00:00Z",
      authorName: "Olena",
      context: null,
      hasScreenshot: false,
      screenshot: undefined,
    });
    expect(detail?.comments).toEqual([
      {
        id: "40000000-0000-4000-8000-000000000001",
        authorName: "Olena",
        body: "Hello @Max",
        createdAt: "2026-10-22T09:00:00Z",
        editedAt: null,
        deleted: false,
        mentions: [{ id: "00000000-0000-4000-8000-000000000002", displayName: "Max" }],
      },
    ]);
  });

  it("names the author of a thread whose creator left the workspace", async () => {
    const { client } = fakeClient(
      tables({
        data: { ...THREAD, created_by: "00000000-0000-4000-8000-0000000000ff" },
        error: null,
      }),
    );

    const detail = await readThreadDetail(client, THREAD_ID);

    expect(detail?.authorName).toBe(FORMER_MEMBER_LABEL);
  });

  it("signs the screenshot of the thread", async () => {
    const { client, createSignedUrl } = fakeClient(
      tables({ data: { ...THREAD, screenshot_path: "a/b.webp" }, error: null }),
    );

    const detail = await readThreadDetail(client, THREAD_ID);

    expect(createSignedUrl).toHaveBeenCalledWith("a/b.webp", 3600);
    expect(detail?.hasScreenshot).toBe(true);
    expect(detail?.screenshot).toEqual({
      status: "ready",
      url: "https://storage.example.test/shot.webp",
    });
  });
});
