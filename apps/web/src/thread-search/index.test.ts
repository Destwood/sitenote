import type { SitenoteClient } from "@sitenote/db";
import { describe, expect, it, vi } from "vitest";

import type { ThreadFilters } from "../thread-filters";
import { searchThreads } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const SITE_ID = "30000000-0000-4000-8000-000000000001";

const FILTERS: ThreadFilters = {
  site: null,
  page: "",
  status: "open",
  author: null,
  query: "",
};

const ROW = {
  thread_id: "20000000-0000-4000-8000-000000000001",
  site_id: SITE_ID,
  page_url: "https://example.test/pricing",
  status: "open",
  created_by: "u-1",
  created_at: "2026-10-22T09:00:00Z",
  comment_count: 2,
  last_activity: "2026-10-22T10:00:00Z",
  first_body: "The price is unclear",
  total_count: 26,
};

function clientReturning(result: unknown, typesResult: unknown = { data: [], error: null }) {
  const rpc = vi.fn(() => Promise.resolve(result));
  const inIds = vi.fn(() => Promise.resolve(typesResult));
  const from = vi.fn(() => ({ select: () => ({ in: inIds }) }));
  return { client: { rpc, from } as unknown as SitenoteClient, rpc, from, inIds };
}

describe("searchThreads", () => {
  it("maps the rows and reads the total from the first row", async () => {
    const { client } = clientReturning({ data: [ROW], error: null });

    await expect(searchThreads(client, WORKSPACE_ID, FILTERS, 1)).resolves.toEqual({
      rows: [
        {
          id: ROW.thread_id,
          pageUrl: ROW.page_url,
          status: "open",
          createdBy: "u-1",
          createdAt: ROW.created_at,
          commentCount: 2,
          lastActivity: ROW.last_activity,
          firstBody: ROW.first_body,
          hasRecording: false,
        },
      ],
      total: 26,
    });
  });

  it("marks a thread as a video when its context has a recording with a path", async () => {
    const { client, from, inIds } = clientReturning(
      { data: [ROW, { ...ROW, thread_id: "20000000-0000-4000-8000-000000000002" }], error: null },
      {
        data: [
          { id: ROW.thread_id, recording: { path: "w/a.webm" } },
          { id: "20000000-0000-4000-8000-000000000002", recording: null },
        ],
        error: null,
      },
    );

    const result = await searchThreads(client, WORKSPACE_ID, FILTERS, 1);

    expect(from).toHaveBeenCalledWith("threads");
    expect(inIds).toHaveBeenCalledWith("id", [
      ROW.thread_id,
      "20000000-0000-4000-8000-000000000002",
    ]);
    expect(result.rows.map((row) => row.hasRecording)).toEqual([true, false]);
  });

  it("does not treat a recording without a string path as a video", async () => {
    const { client } = clientReturning(
      { data: [ROW], error: null },
      { data: [{ id: ROW.thread_id, recording: { path: 5 } }], error: null },
    );

    const result = await searchThreads(client, WORKSPACE_ID, FILTERS, 1);

    expect(result.rows[0]?.hasRecording).toBe(false);
  });

  it("throws when the thread types cannot be read", async () => {
    const { client } = clientReturning(
      { data: [ROW], error: null },
      { data: null, error: { message: "down" } },
    );

    await expect(searchThreads(client, WORKSPACE_ID, FILTERS, 1)).rejects.toThrow(
      "Could not read the thread types.",
    );
  });

  it("reports no matches when the page is empty", async () => {
    const { client, from } = clientReturning({ data: [], error: null });

    await expect(searchThreads(client, WORKSPACE_ID, FILTERS, 1)).resolves.toEqual({
      rows: [],
      total: 0,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("sends the filters and the page offset, leaving unset filters out", async () => {
    const { client, rpc } = clientReturning({ data: [], error: null });

    await searchThreads(
      client,
      WORKSPACE_ID,
      { ...FILTERS, site: SITE_ID, query: "contrast", status: "all" },
      3,
    );

    expect(rpc).toHaveBeenCalledWith("search_threads", {
      p_workspace_id: WORKSPACE_ID,
      p_q: "contrast",
      p_page: undefined,
      p_site_id: SITE_ID,
      p_author_id: undefined,
      p_status: undefined,
      p_limit: 25,
      p_offset: 50,
    });
  });

  it("sends the open status as a filter", async () => {
    const { client, rpc } = clientReturning({ data: [], error: null });

    await searchThreads(client, WORKSPACE_ID, FILTERS, 1);

    expect(rpc).toHaveBeenCalledWith(
      "search_threads",
      expect.objectContaining({ p_status: "open", p_offset: 0 }),
    );
  });

  it("throws when the search fails", async () => {
    const { client } = clientReturning({ data: null, error: { message: "down" } });

    await expect(searchThreads(client, WORKSPACE_ID, FILTERS, 1)).rejects.toThrow(
      "Could not search the threads.",
    );
  });
});
