import type { ThreadContext } from "@sitenote/core";
import type { SitenoteClient } from "@sitenote/db";
import { describe, expect, it, vi } from "vitest";

import { failure, success, type DataRequest } from "../messages";
import type { ThreadScreenshots } from "../screenshot-upload";
import {
  SIGNED_URL_REFRESH_MARGIN_MS,
  SIGNED_URL_TTL_SECONDS,
  createDataService,
  toExcerpt,
  type DataService,
} from ".";

const USER_ID = "00000000-0000-4000-8000-000000000002";
const OTHER_ID = "00000000-0000-4000-8000-000000000003";
const SITE_ID = "20000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const COMMENT_ID = "40000000-0000-4000-8000-000000000001";
const NOTIFICATION_ID = "50000000-0000-4000-8000-000000000001";
const ORIGIN = "https://example.test";
const PAGE_URL = "https://example.test/pricing";

const TEXT_ANCHOR = {
  kind: "text",
  quote: { exact: "Price", prefix: "", suffix: "" },
  position: { start: 0, end: 5 },
  container: "body",
} as const;

const CONTEXT: ThreadContext = {
  viewport: { width: 1440, height: 900 },
  devicePixelRatio: 2,
  pageTitle: "Northwind",
  url: "https://example.test/pricing?x=1",
  browser: { name: "Chrome", version: "130" },
  os: { name: "macOS", version: "14.5" },
  userAgent: "ua",
  consoleErrors: [
    { kind: "error", message: "Boom", at: "2026-10-22T09:30:00.000Z" },
    { kind: "console.error", message: "Clicked", at: "2026-10-22T09:30:01.000Z" },
  ],
  capturedAt: "2026-10-22T09:30:02.000Z",
};
const CAPTURE_ID = "60000000-0000-4000-8000-000000000001";

interface Response {
  data: unknown;
  error: unknown;
  count?: number;
}

interface Call {
  method: string;
  args: unknown[];
}

interface Query {
  target: string;
  calls: Call[];
}

function ok(data: unknown): Response {
  return { data, error: null };
}

function counted(count: number): Response {
  return { data: null, error: null, count };
}

function broken(error: unknown): Response {
  return { data: null, error };
}

interface SignedCall {
  bucket: string;
  path: string;
  ttl: number;
}

function createFake(options: {
  session?: boolean | "throws";
  responses: Record<string, Response[]>;
  signed?: unknown[];
}) {
  const queries: Query[] = [];
  const signedCalls: SignedCall[] = [];
  const signedQueue = [...(options.signed ?? [])];

  function chain(target: string, calls: Call[]): unknown {
    const query: Query = { target, calls };
    queries.push(query);
    const proxy: unknown = new Proxy(
      {},
      {
        get(_object, property) {
          if (property === "then") {
            const queue = options.responses[target] ?? [];
            const next = queue.shift();
            return (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
              if (next === undefined) {
                reject(new Error(`No response queued for ${target}`));
              } else {
                resolve(next);
              }
            };
          }
          return (...args: unknown[]) => {
            query.calls.push({ method: String(property), args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  }

  const client = {
    from: (table: string) => chain(table, []),
    rpc: (name: string, args: unknown) => chain(`rpc:${name}`, [{ method: "rpc", args: [args] }]),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (path: string, ttl: number) => {
          signedCalls.push({ bucket, path, ttl });
          const next = signedQueue.shift() ?? {
            data: { signedUrl: "https://storage.test/signed" },
            error: null,
          };
          return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
        },
      }),
    },
    auth: {
      getSession: () => {
        if (options.session === "throws") {
          return Promise.reject(new Error("storage unavailable"));
        }
        return Promise.resolve({
          data: { session: options.session === false ? null : { user: { id: USER_ID } } },
        });
      },
    },
  } as unknown as SitenoteClient;

  return { client, queries, signedCalls };
}

function setup(
  responses: Record<string, Response[]>,
  extra: {
    session?: boolean | "throws";
    enabled?: boolean;
    captureErrors?: boolean;
    now?: () => number;
    signed?: unknown[];
    attach?: ThreadScreenshots["attach"];
  } = {},
) {
  const fake = createFake({
    responses,
    ...(extra.session === undefined ? {} : { session: extra.session }),
    ...(extra.signed === undefined ? {} : { signed: extra.signed }),
  });
  const getEnabledSite = vi.fn(() =>
    Promise.resolve(
      extra.enabled === false
        ? null
        : {
            siteId: SITE_ID,
            workspaceId: WORKSPACE_ID,
            captureErrors: extra.captureErrors ?? true,
          },
    ),
  );
  const screenshots = {
    attach: vi.fn<ThreadScreenshots["attach"]>(extra.attach ?? (() => Promise.resolve(null))),
    discard: vi.fn<ThreadScreenshots["discard"]>(),
  };
  const service = createDataService({
    client: fake.client,
    getEnabledSite,
    screenshots,
    ...(extra.now === undefined ? {} : { now: extra.now }),
  });
  return { service, getEnabledSite, screenshots, ...fake };
}

function profile(id: string, name: string) {
  return { user_id: id, display_name: name, avatar_url: null };
}

function commentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COMMENT_ID,
    thread_id: THREAD_ID,
    author_id: USER_ID,
    body: "Looks wrong",
    mentions: [],
    edited_at: null,
    deleted_at: null,
    created_at: "2026-10-21T10:00:00+00:00",
    author: profile(USER_ID, "Max Member"),
    ...overrides,
  };
}

function threadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: THREAD_ID,
    site_id: SITE_ID,
    page_url: PAGE_URL,
    anchor: TEXT_ANCHOR,
    status: "open",
    context: CONTEXT,
    screenshot_path: null,
    created_at: "2026-10-21T09:00:00+00:00",
    created_by: USER_ID,
    author: profile(USER_ID, "Max Member"),
    comments: [commentRow()],
    ...overrides,
  };
}

function callsOf(queries: Query[], target: string): Call[][] {
  return queries.filter((query) => query.target === target).map((query) => query.calls);
}

const LIST = { type: "threads.list", siteId: SITE_ID, pageUrl: PAGE_URL } as const;

describe("without a session", () => {
  it.each([
    [
      "forOrigin",
      (service: DataService) => service.forOrigin({ type: "sites.forOrigin", origin: ORIGIN }),
    ],
    ["listThreads", (service: DataService) => service.listThreads(LIST)],
    ["listWorkspaces", (service: DataService) => service.listWorkspaces()],
    [
      "listMembers",
      (service: DataService) =>
        service.listMembers({ type: "members.list", workspaceId: WORKSPACE_ID }),
    ],
    [
      "listNotifications",
      (service: DataService) =>
        service.listNotifications({ type: "notifications.list", limit: 10 }),
    ],
    [
      "markNotificationsRead",
      (service: DataService) =>
        service.markNotificationsRead({ type: "notifications.markRead", ids: [NOTIFICATION_ID] }),
    ],
    ["markAllNotificationsRead", (service: DataService) => service.markAllNotificationsRead()],
    ["countUnreadNotifications", (service: DataService) => service.countUnreadNotifications()],
    ["ensureSite", (service: DataService) => service.ensureSite(WORKSPACE_ID, ORIGIN)],
    [
      "createComment",
      (service: DataService) =>
        service.createComment({
          type: "comments.create",
          threadId: THREAD_ID,
          body: "x",
          mentions: [],
        }),
    ],
  ])("%s answers unauthorized and never queries", async (_name, run) => {
    const { service, queries } = setup({}, { session: false });

    expect(await run(service)).toEqual(failure("unauthorized"));
    expect(queries).toEqual([]);
  });

  it("treats a storage failure as no session", async () => {
    const { service } = setup({}, { session: "throws" });

    expect(await service.listThreads(LIST)).toEqual(failure("unauthorized"));
    expect(await service.hasSession()).toBe(false);
  });

  it("reports a session when there is one", async () => {
    expect(await setup({}).service.hasSession()).toBe(true);
  });
});

describe("listThreads", () => {
  it("maps a page's threads with comments and authors to the transport shape", async () => {
    const { service, queries } = setup({
      threads: [
        ok([
          threadRow({
            comments: [
              commentRow({
                id: "40000000-0000-4000-8000-000000000002",
                created_at: "2026-10-21T11:00:00+00:00",
                edited_at: "2026-10-21T12:00:00+00:00",
                body: "Second",
              }),
              commentRow(),
            ],
          }),
        ]),
      ],
    });

    const result = await service.listThreads(LIST);

    expect(result).toEqual(
      success([
        {
          id: THREAD_ID,
          siteId: SITE_ID,
          pageUrl: PAGE_URL,
          status: "open",
          anchor: TEXT_ANCHOR,
          author: { id: USER_ID, displayName: "Max Member", avatarUrl: null },
          createdAt: "2026-10-21T09:00:00.000Z",
          context: CONTEXT,
          hasScreenshot: false,
          comments: [
            {
              id: COMMENT_ID,
              threadId: THREAD_ID,
              author: { id: USER_ID, displayName: "Max Member", avatarUrl: null },
              body: "Looks wrong",
              createdAt: "2026-10-21T10:00:00.000Z",
              editedAt: null,
              deleted: false,
              mentions: [],
            },
            {
              id: "40000000-0000-4000-8000-000000000002",
              threadId: THREAD_ID,
              author: { id: USER_ID, displayName: "Max Member", avatarUrl: null },
              body: "Second",
              createdAt: "2026-10-21T11:00:00.000Z",
              editedAt: "2026-10-21T12:00:00.000Z",
              deleted: false,
              mentions: [],
            },
          ],
        },
      ]),
    );
    const [calls] = callsOf(queries, "threads");
    expect(calls?.map((call) => call.method)).toEqual(["select", "eq", "eq", "order"]);
    expect(calls?.[1]?.args).toEqual(["site_id", SITE_ID]);
    expect(calls?.[2]?.args).toEqual(["page_url", PAGE_URL]);
  });

  it("selects the embedded comments and both author profiles in one query", async () => {
    const { service, queries } = setup({ threads: [ok([])] });

    await service.listThreads(LIST);

    expect(queries).toHaveLength(1);
    const select = String(callsOf(queries, "threads")[0]?.[0]?.args[0]);
    expect(select).toContain("comments(");
    expect(select).toContain("profiles!threads_created_by_fkey");
    expect(select).toContain("profiles!comments_author_id_fkey");
  });

  it("marks an unreadable anchor as null instead of failing the list", async () => {
    const { service } = setup({
      threads: [ok([threadRow({ anchor: { kind: "element" } }), threadRow({ anchor: "junk" })])],
    });

    const result = await service.listThreads(LIST);

    expect(result.ok && result.data.map((thread) => thread.anchor)).toEqual([null, null]);
  });

  it("names users whose profile is not visible or who were deleted", async () => {
    const { service } = setup({
      threads: [
        ok([
          threadRow({
            created_by: null,
            author: null,
            comments: [
              commentRow({ author: null, author_id: OTHER_ID }),
              commentRow({
                author: null,
                author_id: null,
                id: "40000000-0000-4000-8000-000000000009",
              }),
            ],
          }),
        ]),
      ],
    });

    const result = await service.listThreads(LIST);

    expect(result.ok && result.data[0]?.author).toEqual({
      id: "",
      displayName: "Deleted user",
      avatarUrl: null,
    });
    expect(result.ok && result.data[0]?.comments.map((comment) => comment.author)).toEqual([
      { id: OTHER_ID, displayName: "Former member", avatarUrl: null },
      { id: "", displayName: "Deleted user", avatarUrl: null },
    ]);
  });

  it("marks deleted comments", async () => {
    const { service } = setup({
      threads: [
        ok([
          threadRow({
            comments: [commentRow({ deleted_at: "2026-10-21T13:00:00+00:00", body: "" })],
          }),
        ]),
      ],
    });

    const result = await service.listThreads(LIST);

    expect(result.ok && result.data[0]?.comments[0]).toMatchObject({ deleted: true, body: "" });
  });

  it("maps database errors to a whitelisted code", async () => {
    const { service } = setup({
      threads: [broken({ code: "42501", message: "secret details" })],
    });

    expect(await service.listThreads(LIST)).toEqual(failure("forbidden"));
  });

  it("maps a thrown failure to a whitelisted code", async () => {
    const { service } = setup({});

    expect(await service.listThreads(LIST)).toEqual(failure("unknown"));
  });
});

describe("createThread", () => {
  const REQUEST: Extract<DataRequest, { type: "threads.create" }> = {
    type: "threads.create",
    siteId: SITE_ID,
    pageUrl: PAGE_URL,
    anchor: TEXT_ANCHOR,
    context: CONTEXT,
    body: "Looks wrong",
    mentions: [OTHER_ID],
  };
  const WITH_CAPTURE = { ...REQUEST, captureId: CAPTURE_ID };
  const PATH = `${WORKSPACE_ID}/${THREAD_ID}.webp`;

  it("calls the create_thread function and returns the stored thread", async () => {
    const { service, queries, screenshots } = setup({
      "rpc:create_thread": [ok({ id: THREAD_ID })],
      threads: [ok(threadRow())],
    });

    const result = await service.createThread(REQUEST);

    expect(result.ok && result.data.id).toBe(THREAD_ID);
    expect(callsOf(queries, "rpc:create_thread")[0]?.[0]?.args[0]).toEqual({
      p_site_id: SITE_ID,
      p_page_url: PAGE_URL,
      p_anchor: TEXT_ANCHOR,
      p_context: CONTEXT,
      p_body: "Looks wrong",
      p_mentions: [OTHER_ID],
    });
    expect(screenshots.attach).not.toHaveBeenCalled();
    expect(screenshots.discard).not.toHaveBeenCalled();
  });

  it("passes the thread id and the path of the uploaded screenshot and forgets the capture", async () => {
    const { service, queries, screenshots } = setup(
      {
        "rpc:create_thread": [ok({ id: THREAD_ID })],
        threads: [ok(threadRow({ screenshot_path: PATH }))],
      },
      { attach: () => Promise.resolve({ threadId: THREAD_ID, path: PATH }) },
    );

    const result = await service.createThread(WITH_CAPTURE);

    expect(result.ok && result.data.hasScreenshot).toBe(true);
    expect(screenshots.attach).toHaveBeenCalledExactlyOnceWith(CAPTURE_ID, WORKSPACE_ID);
    expect(callsOf(queries, "rpc:create_thread")[0]?.[0]?.args[0]).toMatchObject({
      p_id: THREAD_ID,
      p_screenshot_path: PATH,
    });
    expect(screenshots.discard).toHaveBeenCalledExactlyOnceWith(CAPTURE_ID);
  });

  it("passes only the thread id when the upload failed", async () => {
    const { service, queries } = setup(
      { "rpc:create_thread": [ok({ id: THREAD_ID })], threads: [ok(threadRow())] },
      { attach: () => Promise.resolve({ threadId: THREAD_ID, path: null }) },
    );

    const result = await service.createThread(WITH_CAPTURE);

    const args = callsOf(queries, "rpc:create_thread")[0]?.[0]?.args[0];
    expect(args).toMatchObject({ p_id: THREAD_ID });
    expect(args).not.toHaveProperty("p_screenshot_path");
    expect(result.ok && result.data.hasScreenshot).toBe(false);
  });

  it("creates the thread without id and path when the capture is gone", async () => {
    const { service, queries, screenshots } = setup({
      "rpc:create_thread": [ok({ id: THREAD_ID })],
      threads: [ok(threadRow())],
    });

    await service.createThread(WITH_CAPTURE);

    const args = callsOf(queries, "rpc:create_thread")[0]?.[0]?.args[0];
    expect(args).not.toHaveProperty("p_id");
    expect(args).not.toHaveProperty("p_screenshot_path");
    expect(screenshots.discard).toHaveBeenCalledWith(CAPTURE_ID);
  });

  it("keeps the capture for a retry when the function fails", async () => {
    const { service, screenshots } = setup(
      { "rpc:create_thread": [broken({ code: "23514", message: "x" })] },
      { attach: () => Promise.resolve({ threadId: THREAD_ID, path: PATH }) },
    );

    await service.createThread(WITH_CAPTURE);

    expect(screenshots.discard).not.toHaveBeenCalled();
  });

  it("drops the console errors when the site does not capture them", async () => {
    const { service, queries } = setup(
      { "rpc:create_thread": [ok({ id: THREAD_ID })], threads: [ok(threadRow())] },
      { captureErrors: false },
    );

    await service.createThread(REQUEST);

    expect(callsOf(queries, "rpc:create_thread")[0]?.[0]?.args[0]).toMatchObject({
      p_context: { ...CONTEXT, consoleErrors: [] },
    });
  });

  it("removes control characters from the context before storing it", async () => {
    const { service, queries } = setup({
      "rpc:create_thread": [ok({ id: THREAD_ID })],
      threads: [ok(threadRow())],
    });

    await service.createThread({
      ...REQUEST,
      context: { ...CONTEXT, pageTitle: "a\u0000b\uD800" },
    });

    expect(callsOf(queries, "rpc:create_thread")[0]?.[0]?.args[0]).toMatchObject({
      p_context: { pageTitle: "ab\uFFFD" },
    });
  });

  it("is forbidden for a site that is not enabled for the page", async () => {
    const disabled = setup({}, { enabled: false });
    expect(await disabled.service.createThread(REQUEST)).toEqual(failure("forbidden"));
    expect(disabled.queries).toEqual([]);

    const other = setup({});
    expect(
      await other.service.createThread({
        ...REQUEST,
        siteId: "20000000-0000-4000-8000-0000000000ff",
      }),
    ).toEqual(failure("forbidden"));
    expect(other.queries).toEqual([]);
  });

  it("returns the mapped error and reads nothing when the function fails", async () => {
    const { service, queries } = setup({
      "rpc:create_thread": [
        broken({ code: "23514", message: "the comment body must not be empty" }),
      ],
    });

    expect(await service.createThread(REQUEST)).toEqual(failure("validation"));
    expect(queries.map((query) => query.target)).toEqual(["rpc:create_thread"]);
  });
});

describe("setThreadStatus", () => {
  it("updates the status and returns the thread", async () => {
    const { service, queries } = setup({ threads: [ok(threadRow({ status: "resolved" }))] });

    const result = await service.setThreadStatus({
      type: "threads.setStatus",
      threadId: THREAD_ID,
      status: "resolved",
    });

    expect(result.ok && result.data.status).toBe("resolved");
    const [calls] = callsOf(queries, "threads");
    expect(calls?.[0]).toEqual({ method: "update", args: [{ status: "resolved" }] });
    expect(calls?.[1]).toEqual({ method: "eq", args: ["id", THREAD_ID] });
  });

  it("reports a thread that the policy hides as not found", async () => {
    const { service } = setup({ threads: [broken({ code: "PGRST116", message: "0 rows" })] });

    expect(
      await service.setThreadStatus({
        type: "threads.setStatus",
        threadId: THREAD_ID,
        status: "open",
      }),
    ).toEqual(failure("not_found"));
  });
});

describe("comments", () => {
  it("creates a comment in the workspace of its thread as the signed-in user", async () => {
    const { service, queries } = setup({
      threads: [ok({ workspace_id: WORKSPACE_ID })],
      comments: [ok(commentRow())],
    });

    const result = await service.createComment({
      type: "comments.create",
      threadId: THREAD_ID,
      body: "Reply",
      mentions: [OTHER_ID],
    });

    expect(result.ok && result.data.id).toBe(COMMENT_ID);
    expect(callsOf(queries, "comments")[0]?.[0]).toEqual({
      method: "insert",
      args: [
        {
          thread_id: THREAD_ID,
          workspace_id: WORKSPACE_ID,
          author_id: USER_ID,
          body: "Reply",
          mentions: [OTHER_ID],
        },
      ],
    });
  });

  it("does not insert when the thread cannot be read", async () => {
    const { service, queries } = setup({
      threads: [broken({ code: "PGRST116", message: "0 rows" })],
    });

    expect(
      await service.createComment({
        type: "comments.create",
        threadId: THREAD_ID,
        body: "x",
        mentions: [],
      }),
    ).toEqual(failure("not_found"));
    expect(queries.map((query) => query.target)).toEqual(["threads"]);
  });

  it("updates only the body of a comment", async () => {
    const { service, queries } = setup({
      comments: [ok(commentRow({ body: "Edited", edited_at: "2026-10-21T12:00:00+00:00" }))],
    });

    const result = await service.updateComment({
      type: "comments.update",
      commentId: COMMENT_ID,
      body: "Edited",
    });

    expect(result.ok && result.data).toMatchObject({
      body: "Edited",
      editedAt: "2026-10-21T12:00:00.000Z",
    });
    expect(callsOf(queries, "comments")[0]?.[0]).toEqual({
      method: "update",
      args: [{ body: "Edited" }],
    });
  });

  it("deletes a comment by setting deleted_at", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-21T13:00:00.000Z") });
    const { service, queries } = setup({
      comments: [ok(commentRow({ deleted_at: "2026-10-21T13:00:00+00:00", body: "" }))],
    });

    const result = await service.deleteComment({ type: "comments.delete", commentId: COMMENT_ID });
    vi.useRealTimers();

    expect(result.ok && result.data.deleted).toBe(true);
    expect(callsOf(queries, "comments")[0]?.[0]).toEqual({
      method: "update",
      args: [{ deleted_at: "2026-10-21T13:00:00.000Z" }],
    });
  });

  it("maps a read-only deleted comment to a validation error", async () => {
    const { service } = setup({
      comments: [broken({ code: "23514", message: "deleted comments are read-only" })],
    });

    expect(
      await service.updateComment({ type: "comments.update", commentId: COMMENT_ID, body: "x" }),
    ).toEqual(failure("validation"));
  });
});

describe("forOrigin", () => {
  const REQUEST = { type: "sites.forOrigin", origin: ORIGIN } as const;

  it("answers null without any query when the origin is not enabled locally", async () => {
    const { service, queries } = setup({}, { enabled: false });

    expect(await service.forOrigin(REQUEST)).toEqual(success(null));
    expect(queries).toEqual([]);
  });

  it("returns the site with workspace name, role and user id", async () => {
    const { service, queries } = setup({
      members: [ok({ role: "guest", workspaces: { name: "Northwind" } })],
      sites: [ok({ id: SITE_ID })],
    });

    expect(await service.forOrigin(REQUEST)).toEqual(
      success({
        siteId: SITE_ID,
        workspaceId: WORKSPACE_ID,
        workspaceName: "Northwind",
        role: "guest",
        userId: USER_ID,
        captureErrors: true,
      }),
    );
    expect(callsOf(queries, "sites")[0]?.map((call) => call.args)).toEqual([
      ["id"],
      ["id", SITE_ID],
      ["workspace_id", WORKSPACE_ID],
      ["origin", ORIGIN],
      [],
    ]);
  });

  it.each([
    ["the user left the workspace", { members: [ok(null)], sites: [ok({ id: SITE_ID })] }],
    [
      "the workspace is not readable",
      { members: [ok({ role: "member", workspaces: null })], sites: [ok({ id: SITE_ID })] },
    ],
    [
      "the site was removed",
      { members: [ok({ role: "member", workspaces: { name: "N" } })], sites: [ok(null)] },
    ],
  ])("answers null when %s", async (_name, responses) => {
    const { service } = setup(responses);

    expect(await service.forOrigin(REQUEST)).toEqual(success(null));
  });

  it("maps a failing query to a whitelisted code", async () => {
    const { service } = setup({
      members: [broken({ code: "", message: "TypeError: Failed to fetch" })],
      sites: [ok({ id: SITE_ID })],
    });

    expect(await service.forOrigin(REQUEST)).toEqual(failure("network"));
  });
});

describe("listWorkspaces", () => {
  it("lists the workspaces of the user with their role and skips unreadable ones", async () => {
    const { service, queries } = setup({
      members: [
        ok([
          { role: "owner", workspaces: { id: WORKSPACE_ID, name: "Northwind" } },
          { role: "member", workspaces: null },
          { role: "guest", workspaces: { id: SITE_ID, name: "Agency" } },
        ]),
      ],
    });

    expect(await service.listWorkspaces()).toEqual(
      success([
        { id: WORKSPACE_ID, name: "Northwind", role: "owner" },
        { id: SITE_ID, name: "Agency", role: "guest" },
      ]),
    );
    expect(callsOf(queries, "members")[0]?.[1]).toEqual({
      method: "eq",
      args: ["user_id", USER_ID],
    });
  });
});

describe("ensureSite", () => {
  it("returns the id of a site that already exists without inserting", async () => {
    const { service, queries } = setup({ sites: [ok({ id: SITE_ID })] });

    expect(await service.ensureSite(WORKSPACE_ID, ORIGIN)).toEqual(success(SITE_ID));
    expect(queries).toHaveLength(1);
  });

  it("inserts the origin when it is new", async () => {
    const { service, queries } = setup({ sites: [ok(null), ok({ id: SITE_ID })] });

    expect(await service.ensureSite(WORKSPACE_ID, ORIGIN)).toEqual(success(SITE_ID));
    expect(callsOf(queries, "sites")[1]?.[0]).toEqual({
      method: "insert",
      args: [{ workspace_id: WORKSPACE_ID, origin: ORIGIN }],
    });
  });

  it("reads the row again when another client inserted it first", async () => {
    const { service } = setup({
      sites: [ok(null), broken({ code: "23505", message: "dup" }), ok({ id: SITE_ID })],
    });

    expect(await service.ensureSite(WORKSPACE_ID, ORIGIN)).toEqual(success(SITE_ID));
  });

  it("is forbidden for a user who may not insert sites", async () => {
    const { service } = setup({
      sites: [ok(null), broken({ code: "42501", message: "row-level security" })],
    });

    expect(await service.ensureSite(WORKSPACE_ID, ORIGIN)).toEqual(failure("forbidden"));
  });
});

describe("findThreadPage", () => {
  it("returns the page of a thread", async () => {
    const { service } = setup({ threads: [ok({ page_url: PAGE_URL })] });

    expect(await service.findThreadPage(THREAD_ID)).toBe(PAGE_URL);
  });

  it.each([
    ["the thread is not visible", { threads: [ok(null)] }],
    ["the query fails", { threads: [broken({ code: "42501", message: "x" })] }],
    ["the request throws", {}],
  ])("returns null when %s", async (_name, responses) => {
    expect(await setup(responses).service.findThreadPage(THREAD_ID)).toBeNull();
  });
});

describe("comment mentions", () => {
  it("returns the mentioned ids of a comment", async () => {
    const { service } = setup({
      threads: [ok({ workspace_id: WORKSPACE_ID })],
      comments: [ok(commentRow({ mentions: [OTHER_ID] }))],
    });

    const result = await service.createComment({
      type: "comments.create",
      threadId: THREAD_ID,
      body: "Hi",
      mentions: [OTHER_ID],
    });

    expect(result.ok && result.data.mentions).toEqual([OTHER_ID]);
  });
});

function memberRow(id: string, name: string, role: "owner" | "member" | "guest") {
  return { role, profile: profile(id, name) };
}

const MEMBERS = {
  type: "members.list",
  workspaceId: WORKSPACE_ID,
} as const;

describe("listMembers", () => {
  it("maps the members with their profile and role, sorted by name, and skips unreadable ones", async () => {
    const { service, queries } = setup({
      members: [
        ok([
          memberRow(OTHER_ID, "Olena Owner", "owner"),
          { role: "guest", profile: null },
          memberRow(USER_ID, "Max Member", "member"),
        ]),
      ],
    });

    expect(await service.listMembers(MEMBERS)).toEqual(
      success([
        { id: USER_ID, displayName: "Max Member", avatarUrl: null, role: "member" },
        { id: OTHER_ID, displayName: "Olena Owner", avatarUrl: null, role: "owner" },
      ]),
    );
    expect(callsOf(queries, "members")[0]?.map((call) => call.method)).toEqual(["select", "eq"]);
    expect(callsOf(queries, "members")[0]?.[1]?.args).toEqual(["workspace_id", WORKSPACE_ID]);
  });

  it("serves a second request within a minute from the cache and asks again after it", async () => {
    let clock = 1_000_000;
    const { service, queries } = setup(
      {
        members: [
          ok([memberRow(USER_ID, "Max Member", "member")]),
          ok([memberRow(USER_ID, "Max Renamed", "member")]),
        ],
      },
      { now: () => clock },
    );

    const first = await service.listMembers(MEMBERS);
    clock += 59_999;
    const cached = await service.listMembers(MEMBERS);
    clock += 1;
    const refreshed = await service.listMembers(MEMBERS);

    expect(first.ok && first.data[0]?.displayName).toBe("Max Member");
    expect(cached).toEqual(first);
    expect(refreshed.ok && refreshed.data[0]?.displayName).toBe("Max Renamed");
    expect(callsOf(queries, "members")).toHaveLength(2);
  });

  it("caches per workspace", async () => {
    const { service, queries } = setup({
      members: [ok([memberRow(USER_ID, "Max Member", "member")]), ok([])],
    });

    await service.listMembers(MEMBERS);
    await service.listMembers({ ...MEMBERS, workspaceId: SITE_ID });

    expect(callsOf(queries, "members")).toHaveLength(2);
  });

  it("does not cache a failure", async () => {
    const { service } = setup({
      members: [
        broken({ code: "42501", message: "x" }),
        ok([memberRow(USER_ID, "Max Member", "member")]),
      ],
    });

    expect(await service.listMembers(MEMBERS)).toEqual(failure("forbidden"));
    expect((await service.listMembers(MEMBERS)).ok).toBe(true);
  });
});

function notificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTIFICATION_ID,
    kind: "mention",
    read_at: null,
    created_at: "2026-10-21T10:00:00+00:00",
    thread_id: THREAD_ID,
    thread: { page_url: PAGE_URL, status: "open" },
    comment: {
      body: "Please check",
      deleted_at: null,
      author: { display_name: "Max Member" },
    },
    ...overrides,
  };
}

const NOTIFICATIONS = { type: "notifications.list", limit: 30 } as const;

describe("toExcerpt", () => {
  it("collapses whitespace and keeps short text", () => {
    expect(toExcerpt("  one\n\n two\tthree  ")).toBe("one two three");
  });

  it("cuts at 140 characters and marks the cut", () => {
    expect(toExcerpt("a".repeat(140))).toBe("a".repeat(140));
    expect(toExcerpt("a".repeat(141))).toBe(`${"a".repeat(140)}…`);
  });

  it("counts whole characters, not surrogate halves", () => {
    const cut = toExcerpt("😀".repeat(141));

    expect(Array.from(cut)).toHaveLength(141);
    expect(cut.endsWith("😀…")).toBe(true);
  });

  it("leaves markup as the text it is", () => {
    expect(toExcerpt("<img src=x onerror=alert(1)>")).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("listNotifications", () => {
  it("maps the notifications of the user and the exact unread count", async () => {
    const { service, queries } = setup({
      notifications: [
        ok([
          notificationRow(),
          notificationRow({
            id: "50000000-0000-4000-8000-000000000002",
            kind: "reply",
            read_at: "2026-10-21T11:00:00+00:00",
            thread: { page_url: PAGE_URL, status: "resolved" },
            comment: { body: "x".repeat(200), deleted_at: null, author: null },
          }),
        ]),
        counted(7),
      ],
    });

    const result = await service.listNotifications(NOTIFICATIONS);

    expect(result).toEqual(
      success({
        unread: 7,
        items: [
          {
            id: NOTIFICATION_ID,
            kind: "mention",
            threadId: THREAD_ID,
            pageUrl: PAGE_URL,
            threadStatus: "open",
            excerpt: "Please check",
            actorName: "Max Member",
            createdAt: "2026-10-21T10:00:00.000Z",
            read: false,
          },
          {
            id: "50000000-0000-4000-8000-000000000002",
            kind: "reply",
            threadId: THREAD_ID,
            pageUrl: PAGE_URL,
            threadStatus: "resolved",
            excerpt: `${"x".repeat(140)}…`,
            actorName: "Former member",
            createdAt: "2026-10-21T10:00:00.000Z",
            read: true,
          },
        ],
      }),
    );
    const [list, count] = callsOf(queries, "notifications");
    expect(list?.map((call) => call.method)).toEqual(["select", "eq", "order", "limit"]);
    expect(list?.[1]?.args).toEqual(["user_id", USER_ID]);
    expect(list?.[2]?.args).toEqual(["created_at", { ascending: false }]);
    expect(list?.[3]?.args).toEqual([30]);
    expect(count?.map((call) => call.method)).toEqual(["select", "eq", "is"]);
    expect(count?.[0]?.args).toEqual(["id", { count: "exact", head: true }]);
    expect(count?.[2]?.args).toEqual(["read_at", null]);
  });

  it("blanks the excerpt of a deleted comment", async () => {
    const { service } = setup({
      notifications: [
        ok([
          notificationRow({
            comment: {
              body: "secret",
              deleted_at: "2026-10-21T11:00:00+00:00",
              author: { display_name: "Max Member" },
            },
          }),
        ]),
        counted(1),
      ],
    });

    const result = await service.listNotifications(NOTIFICATIONS);

    expect(result.ok && result.data.items[0]?.excerpt).toBe("");
  });

  it.each([
    ["the thread is not readable", { thread: null }],
    ["the comment is not readable", { comment: null }],
    [
      "the page url is not a normal web address",
      { thread: { page_url: "javascript:alert(1)", status: "open" } },
    ],
  ])("skips a notification when %s", async (_name, overrides) => {
    const { service } = setup({
      notifications: [ok([notificationRow(overrides), notificationRow()]), counted(2)],
    });

    const result = await service.listNotifications(NOTIFICATIONS);

    expect(result.ok && result.data.items).toHaveLength(1);
    expect(result.ok && result.data.unread).toBe(2);
  });

  it("normalises the page url of the thread", async () => {
    const { service } = setup({
      notifications: [
        ok([notificationRow({ thread: { page_url: `${PAGE_URL}/?a=1#top`, status: "open" } })]),
        counted(1),
      ],
    });

    const result = await service.listNotifications(NOTIFICATIONS);

    expect(result.ok && result.data.items[0]?.pageUrl).toBe(PAGE_URL);
  });

  it("maps a failing list or count to a whitelisted code", async () => {
    const failingList = setup({
      notifications: [broken({ code: "42501", message: "x" }), counted(0)],
    });
    const failingCount = setup({
      notifications: [ok([]), broken({ code: "PGRST301", message: "jwt" })],
    });

    expect(await failingList.service.listNotifications(NOTIFICATIONS)).toEqual(
      failure("forbidden"),
    );
    expect(await failingCount.service.listNotifications(NOTIFICATIONS)).toEqual(
      failure("unauthorized"),
    );
  });
});

describe("markNotificationsRead", () => {
  it("marks only the given unread notifications of the user", async () => {
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    const { service, queries } = setup({ notifications: [ok(null)] }, { now: () => now });

    const result = await service.markNotificationsRead({
      type: "notifications.markRead",
      ids: [NOTIFICATION_ID],
    });

    expect(result).toEqual(success(null));
    expect(callsOf(queries, "notifications")[0]).toEqual([
      { method: "update", args: [{ read_at: "2026-10-21T12:00:00.000Z" }] },
      { method: "eq", args: ["user_id", USER_ID] },
      { method: "in", args: ["id", [NOTIFICATION_ID]] },
      { method: "is", args: ["read_at", null] },
    ]);
  });

  it("maps a database error", async () => {
    const { service } = setup({ notifications: [broken({ code: "42501", message: "x" })] });

    expect(
      await service.markNotificationsRead({
        type: "notifications.markRead",
        ids: [NOTIFICATION_ID],
      }),
    ).toEqual(failure("forbidden"));
  });
});

describe("markAllNotificationsRead", () => {
  it("marks every unread notification of the user", async () => {
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    const { service, queries } = setup({ notifications: [ok(null)] }, { now: () => now });

    expect(await service.markAllNotificationsRead()).toEqual(success(null));
    expect(callsOf(queries, "notifications")[0]).toEqual([
      { method: "update", args: [{ read_at: "2026-10-21T12:00:00.000Z" }] },
      { method: "eq", args: ["user_id", USER_ID] },
      { method: "is", args: ["read_at", null] },
    ]);
  });

  it("maps a database error", async () => {
    const { service } = setup({ notifications: [broken({ message: "boom" })] });

    expect(await service.markAllNotificationsRead()).toEqual(failure("unknown"));
  });
});

describe("countUnreadNotifications", () => {
  it("returns the exact count and treats a missing count as zero", async () => {
    const { service } = setup({ notifications: [counted(12), ok(null)] });

    expect(await service.countUnreadNotifications()).toEqual(success(12));
    expect(await service.countUnreadNotifications()).toEqual(success(0));
  });

  it("maps a database error", async () => {
    const { service } = setup({ notifications: [broken({ code: "PGRST301", message: "jwt" })] });

    expect(await service.countUnreadNotifications()).toEqual(failure("unauthorized"));
  });
});

describe("thread context and screenshot mapping", () => {
  it("maps an invalid or empty stored context to null and keeps the thread", async () => {
    const { service } = setup({
      threads: [
        ok([
          threadRow({ context: {} }),
          threadRow({ id: "30000000-0000-4000-8000-000000000002", context: { viewport: "wide" } }),
          threadRow({ id: "30000000-0000-4000-8000-000000000003", context: null }),
        ]),
      ],
    });

    const result = await service.listThreads(LIST);

    expect(result.ok && result.data.map((thread) => thread.context)).toEqual([null, null, null]);
  });

  it("reports whether a screenshot path is stored", async () => {
    const { service } = setup({
      threads: [
        ok([
          threadRow({ screenshot_path: `${WORKSPACE_ID}/${THREAD_ID}.webp` }),
          threadRow({ id: "30000000-0000-4000-8000-000000000002" }),
        ]),
      ],
    });

    const result = await service.listThreads(LIST);

    expect(result.ok && result.data.map((thread) => thread.hasScreenshot)).toEqual([true, false]);
  });

  it("selects the context and the screenshot path with the thread", async () => {
    const { service, queries } = setup({ threads: [ok([])] });

    await service.listThreads(LIST);

    const select = String(callsOf(queries, "threads")[0]?.[0]?.args[0]);
    expect(select).toContain("context, screenshot_path");
  });
});

describe("screenshotUrl", () => {
  const REQUEST = { type: "threads.screenshotUrl", threadId: THREAD_ID } as const;
  const PATH = `${WORKSPACE_ID}/${THREAD_ID}.webp`;
  const HOUR_MS = SIGNED_URL_TTL_SECONDS * 1000;

  it("signs the stored path for one hour", async () => {
    const { service, signedCalls, queries } = setup({
      threads: [ok({ screenshot_path: PATH })],
    });

    expect(await service.screenshotUrl(REQUEST)).toEqual(success("https://storage.test/signed"));

    expect(signedCalls).toEqual([{ bucket: "screenshots", path: PATH, ttl: 3600 }]);
    expect(callsOf(queries, "threads")[0]?.map((call) => call.args)).toEqual([
      ["screenshot_path"],
      ["id", THREAD_ID],
      [],
    ]);
  });

  it("answers null for a thread without a screenshot and not found for a hidden thread", async () => {
    const none = setup({ threads: [ok({ screenshot_path: null })] });
    expect(await none.service.screenshotUrl(REQUEST)).toEqual(success(null));
    expect(none.signedCalls).toEqual([]);

    const hidden = setup({ threads: [ok(null)] });
    expect(await hidden.service.screenshotUrl(REQUEST)).toEqual(failure("not_found"));
  });

  it("reuses a signed url until five minutes before it expires", async () => {
    let now = 1_000_000;
    const { service, signedCalls } = setup(
      { threads: [ok({ screenshot_path: PATH }), ok({ screenshot_path: PATH })] },
      {
        now: () => now,
        signed: [
          { data: { signedUrl: "https://storage.test/one" }, error: null },
          { data: { signedUrl: "https://storage.test/two" }, error: null },
        ],
      },
    );

    expect(await service.screenshotUrl(REQUEST)).toEqual(success("https://storage.test/one"));
    now += HOUR_MS - SIGNED_URL_REFRESH_MARGIN_MS - 1;
    expect(await service.screenshotUrl(REQUEST)).toEqual(success("https://storage.test/one"));
    expect(signedCalls).toHaveLength(1);

    now += 1;
    expect(await service.screenshotUrl(REQUEST)).toEqual(success("https://storage.test/two"));
    expect(signedCalls).toHaveLength(2);
  });

  it("does not cache failures", async () => {
    const { service, signedCalls } = setup(
      { threads: [ok({ screenshot_path: PATH }), ok({ screenshot_path: PATH })] },
      { signed: [{ data: null, error: { message: "boom", status: 500 } }] },
    );

    expect((await service.screenshotUrl(REQUEST)).ok).toBe(false);
    expect(await service.screenshotUrl(REQUEST)).toEqual(success("https://storage.test/signed"));
    expect(signedCalls).toHaveLength(2);
  });

  it("answers unauthorized without a session", async () => {
    const { service, queries } = setup({}, { session: false });

    expect(await service.screenshotUrl(REQUEST)).toEqual(failure("unauthorized"));
    expect(queries).toEqual([]);
  });
});
