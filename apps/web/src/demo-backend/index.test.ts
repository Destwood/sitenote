import type { SitenoteClient } from "@sitenote/db";
import type { CaptureRect, WidgetSubscriptionHandlers } from "@sitenote/widget";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEMO_WORKSPACE_ID } from "../demo-client";
import type { DemoScreenshots } from "../demo-screenshot";
import { createDemoBackend, PREFERENCE_KEY_PREFIX, SIGNED_URL_TTL_SECONDS } from ".";

interface Reply {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

interface Call {
  table: string;
  method: string;
  args: unknown[];
}

interface Listener {
  type: string;
  table: string;
  filter: string;
  callback: (raw: unknown) => void;
}

interface FakeOptions {
  userId?: string | null;
  replies?: Partial<Record<string, Reply>>;
  rpcReplies?: Partial<Record<string, Reply>>;
  upload?: { error: { message: string } | null };
  signed?: Reply;
}

const SITE_ID = "00000000-0000-4000-8000-0000000000b1";
const THREAD_ID = "00000000-0000-4000-8000-0000000000a1";
const COMMENT_ID = "00000000-0000-4000-8000-0000000000c1";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const PAGE_URL = "http://localhost:3000/demo";
const RECT: CaptureRect = { x: 10, y: 20, width: 30, height: 40 };
const ANCHOR = {
  kind: "element" as const,
  selectors: {
    testId: "demo-hero-title",
    css: '[data-testid="demo-hero-title"]',
    nthPath: "main > h1",
  },
  fingerprint: { tag: "h1", text: "Comments", classes: [], width: 640, height: 56 },
  offset: { x: 0.5, y: 0.5 },
};
const CONTEXT = {
  viewport: { width: 1000, height: 800 },
  devicePixelRatio: 1,
  pageTitle: "Demo",
  url: PAGE_URL,
  browser: { name: "Chrome", version: "120" },
  os: { name: "Windows", version: "11" },
  userAgent: "agent",
  consoleErrors: [],
  capturedAt: "2026-10-24T10:00:00.000Z",
};
const PROFILE = { user_id: USER_ID, display_name: "Dana", avatar_url: null };
const THREAD_ROW = {
  id: THREAD_ID,
  site_id: SITE_ID,
  page_url: PAGE_URL,
  anchor: ANCHOR,
  status: "open",
  context: {},
  screenshot_path: null,
  clickup_task_url: null,
  created_at: "2026-10-24T09:00:00.000Z",
  created_by: USER_ID,
  author: PROFILE,
  comments: [],
};
const COMMENT_ROW = {
  id: COMMENT_ID,
  thread_id: THREAD_ID,
  author_id: USER_ID,
  body: "Reply",
  mentions: [],
  edited_at: null,
  deleted_at: null,
  created_at: "2026-10-24T10:00:00.000Z",
  author: PROFILE,
};
const SUBSCRIPTION = {
  siteId: SITE_ID,
  workspaceId: DEMO_WORKSPACE_ID,
  getPageUrl: () => PAGE_URL,
};

function createFakeSupabase(options: FakeOptions = {}) {
  const calls: Call[] = [];
  const listeners: Listener[] = [];
  let statusCallback: ((status: string) => void) | undefined;
  const channel = {
    on: (
      type: string,
      config: { table: string; filter: string },
      callback: Listener["callback"],
    ) => {
      listeners.push({ type, table: config.table, filter: config.filter, callback });
      return channel;
    },
    subscribe: (callback: (status: string) => void) => {
      statusCallback = callback;
      return channel;
    },
  };
  const upload = vi.fn(() => Promise.resolve(options.upload ?? { error: null }));
  const createSignedUrl = vi.fn(() =>
    Promise.resolve(
      options.signed ?? { data: { signedUrl: "https://signed.example/x" }, error: null },
    ),
  );
  const removeChannel = vi.fn(() => Promise.resolve("ok"));
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "insert", "update", "maybeSingle", "single"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    }
    chain.then = (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(options.replies?.[table] ?? { data: null, error: null }).then(
        resolve,
        reject,
      );
    return chain;
  };
  const rpc = vi.fn((name: string) =>
    Promise.resolve(options.rpcReplies?.[name] ?? { data: null, error: null }),
  );
  const client = {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({
          data: {
            session: options.userId === null ? null : { user: { id: options.userId ?? USER_ID } },
          },
          error: null,
        }),
      ),
    },
    from: vi.fn((table: string) => builder(table)),
    rpc,
    storage: { from: vi.fn(() => ({ upload, createSignedUrl })) },
    channel: vi.fn(() => channel),
    removeChannel,
  };
  return {
    client: client as unknown as SitenoteClient,
    mock: { rpc, upload, createSignedUrl, removeChannel, channel: client.channel },
    calls,
    listeners,
    sendStatus: (status: string) => statusCallback?.(status),
  };
}

function fakeScreenshots(
  result: { blob: Blob; width: number; height: number } | Error,
): DemoScreenshots {
  return {
    capture: vi.fn(() =>
      result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
    ),
  };
}

function setup(
  options: FakeOptions = {},
  screenshots: DemoScreenshots = fakeScreenshots({
    blob: new Blob(["x"], { type: "image/webp" }),
    width: 62,
    height: 72,
  }),
) {
  const supabase = createFakeSupabase(options);
  const backend = createDemoBackend({
    client: supabase.client,
    win: window,
    doc: document,
    screenshots,
  });
  return { backend, screenshots, ...supabase };
}

function rpcArguments(
  mock: { rpc: { mock: { calls: unknown[][] } } },
  name: string,
): Record<string, unknown> {
  const call = mock.rpc.mock.calls.find((entry) => entry[0] === name);
  if (call === undefined) {
    throw new Error(`${name} was not called`);
  }
  return call[1] as Record<string, unknown>;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("getSiteInfo", () => {
  it("is unauthorized without a session", async () => {
    const { backend } = setup({ userId: null });
    expect(await backend.getSiteInfo(window.location.origin)).toMatchObject({
      ok: false,
      error: { code: "unauthorized" },
    });
  });

  it("describes the demo site for a joined guest", async () => {
    const { backend } = setup({
      replies: {
        members: { data: { role: "guest", workspaces: { name: "Sitenote demo" } }, error: null },
        sites: { data: { id: SITE_ID }, error: null },
      },
    });
    expect(await backend.getSiteInfo("http://localhost:3000")).toEqual({
      ok: true,
      data: {
        siteId: SITE_ID,
        workspaceId: DEMO_WORKSPACE_ID,
        workspaceName: "Sitenote demo",
        role: "guest",
        userId: USER_ID,
        captureErrors: false,
      },
    });
  });

  it("answers null when the site is not registered", async () => {
    const { backend } = setup({
      replies: {
        members: { data: { role: "guest", workspaces: { name: "Sitenote demo" } }, error: null },
        sites: { data: null, error: null },
      },
    });
    expect(await backend.getSiteInfo("http://localhost:3000")).toEqual({ ok: true, data: null });
  });

  it("maps a read error to the widget error", async () => {
    const { backend } = setup({
      replies: { members: { data: null, error: { code: "42501", message: "denied" } } },
    });
    expect(await backend.getSiteInfo("http://localhost:3000")).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
  });
});

describe("threads and comments", () => {
  it("lists the threads of a page by site and page url", async () => {
    const { backend, calls } = setup({ replies: { threads: { data: [THREAD_ROW], error: null } } });
    const result = await backend.listThreads(SITE_ID, PAGE_URL);
    expect(result).toMatchObject({ ok: true, data: [{ id: THREAD_ID }] });
    expect(calls).toContainEqual({ table: "threads", method: "eq", args: ["site_id", SITE_ID] });
    expect(calls).toContainEqual({ table: "threads", method: "eq", args: ["page_url", PAGE_URL] });
  });

  it("creates a thread without a screenshot", async () => {
    const { backend, mock } = setup({
      replies: { threads: { data: THREAD_ROW, error: null } },
      rpcReplies: { create_thread: { data: THREAD_ROW, error: null } },
    });
    const result = await backend.createThread({
      siteId: SITE_ID,
      pageUrl: PAGE_URL,
      anchor: ANCHOR,
      context: CONTEXT,
      body: "Looks right",
      mentions: [],
    });
    expect(result).toMatchObject({ ok: true, data: { id: THREAD_ID } });
    const args = rpcArguments(mock, "create_thread");
    expect(args).toMatchObject({
      p_site_id: SITE_ID,
      p_page_url: PAGE_URL,
      p_body: "Looks right",
    });
    expect(args).not.toHaveProperty("p_screenshot_path");
    expect(typeof args.p_id).toBe("string");
  });

  it("uploads a captured screenshot under the new thread id and attaches it", async () => {
    const { backend, mock, screenshots } = setup({
      replies: { threads: { data: THREAD_ROW, error: null } },
      rpcReplies: { create_thread: { data: THREAD_ROW, error: null } },
    });
    const captured = await backend.captureScreenshot(RECT, 1);
    if (!captured.ok) {
      throw new Error("the capture should succeed");
    }
    expect(screenshots.capture).toHaveBeenCalledWith(RECT, 1);

    await backend.createThread({
      siteId: SITE_ID,
      pageUrl: PAGE_URL,
      anchor: ANCHOR,
      context: CONTEXT,
      captureId: captured.data.captureId,
      body: "See the pin",
      mentions: [],
    });

    const args = rpcArguments(mock, "create_thread");
    const path = `${DEMO_WORKSPACE_ID}/${String(args.p_id)}.webp`;
    expect(mock.upload).toHaveBeenCalledWith(path, expect.any(Blob), {
      contentType: "image/webp",
      upsert: false,
    });
    expect(args.p_screenshot_path).toBe(path);
  });

  it("creates the thread without a screenshot when the capture is no longer pending", async () => {
    const { backend, mock } = setup({
      replies: { threads: { data: THREAD_ROW, error: null } },
      rpcReplies: { create_thread: { data: THREAD_ROW, error: null } },
    });
    await backend.createThread({
      siteId: SITE_ID,
      pageUrl: PAGE_URL,
      anchor: ANCHOR,
      context: CONTEXT,
      captureId: "00000000-0000-4000-8000-0000000000c9",
      body: "Stale capture",
      mentions: [],
    });
    expect(mock.upload).not.toHaveBeenCalled();
    expect(rpcArguments(mock, "create_thread")).not.toHaveProperty("p_screenshot_path");
  });

  it("reports the demo limit with its own message", async () => {
    const { backend } = setup({
      rpcReplies: {
        create_thread: { data: null, error: { code: "P0001", message: "demo_rate_limited" } },
      },
    });
    expect(
      await backend.createThread({
        siteId: SITE_ID,
        pageUrl: PAGE_URL,
        anchor: ANCHOR,
        context: CONTEXT,
        body: "Too many",
        mentions: [],
      }),
    ).toEqual({
      ok: false,
      error: { code: "demo_limited", message: "Demo limit reached — try again later." },
    });
  });

  it("stops before creating the thread when the screenshot upload fails", async () => {
    const { backend, mock } = setup({ upload: { error: { message: "storage down" } } });
    const captured = await backend.captureScreenshot(RECT, 1);
    if (!captured.ok) {
      throw new Error("the capture should succeed");
    }
    const result = await backend.createThread({
      siteId: SITE_ID,
      pageUrl: PAGE_URL,
      anchor: ANCHOR,
      context: CONTEXT,
      captureId: captured.data.captureId,
      body: "Upload fails",
      mentions: [],
    });
    expect(result).toMatchObject({ ok: false, error: { code: "unknown" } });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("answers capture_failed when the page cannot be rendered", async () => {
    const { backend } = setup({}, fakeScreenshots(new Error("render failed")));
    expect(await backend.captureScreenshot(RECT, 1)).toEqual({
      ok: false,
      error: { code: "capture_failed", message: "The screenshot could not be taken." },
    });
  });

  it("sets the status of a thread", async () => {
    const { backend, calls } = setup({
      replies: { threads: { data: { ...THREAD_ROW, status: "resolved" }, error: null } },
    });
    expect(await backend.setStatus(THREAD_ID, "resolved")).toMatchObject({
      ok: true,
      data: { status: "resolved" },
    });
    expect(calls).toContainEqual({
      table: "threads",
      method: "update",
      args: [{ status: "resolved" }],
    });
  });

  it("adds a comment as the signed-in visitor in the demo workspace", async () => {
    const { backend, calls } = setup({
      replies: { comments: { data: COMMENT_ROW, error: null } },
    });
    expect(
      await backend.createComment({ threadId: THREAD_ID, body: "Reply", mentions: [] }),
    ).toMatchObject({ ok: true, data: { body: "Reply", author: { id: USER_ID } } });
    expect(calls).toContainEqual({
      table: "comments",
      method: "insert",
      args: [
        {
          thread_id: THREAD_ID,
          workspace_id: DEMO_WORKSPACE_ID,
          author_id: USER_ID,
          body: "Reply",
          mentions: [],
        },
      ],
    });
  });

  it("updates the body of a comment", async () => {
    const { backend, calls } = setup({ replies: { comments: { data: COMMENT_ROW, error: null } } });
    await backend.updateComment({ commentId: COMMENT_ID, body: "Edited" });
    expect(calls).toContainEqual({
      table: "comments",
      method: "update",
      args: [{ body: "Edited" }],
    });
  });

  it("soft deletes a comment by stamping deleted_at", async () => {
    const { backend, calls } = setup({
      replies: {
        comments: {
          data: { ...COMMENT_ROW, body: "", deleted_at: "2026-10-24T11:00:00.000Z" },
          error: null,
        },
      },
    });
    expect(await backend.deleteComment(COMMENT_ID)).toMatchObject({
      ok: true,
      data: { deleted: true },
    });
    const update = calls.find((call) => call.method === "update");
    expect(update?.args[0]).toHaveProperty("deleted_at");
  });
});

describe("members, screenshots and clickup", () => {
  it("lists members sorted by name and skips memberships without a profile", async () => {
    const { backend } = setup({
      replies: {
        members: {
          data: [
            { role: "guest", profile: { ...PROFILE, user_id: "2", display_name: "Zed" } },
            { role: "owner", profile: { ...PROFILE, user_id: "1", display_name: "Ana" } },
            { role: "guest", profile: null },
          ],
          error: null,
        },
      },
    });
    const result = await backend.listMembers(DEMO_WORKSPACE_ID);
    expect(result.ok && result.data.map((member) => member.displayName)).toEqual(["Ana", "Zed"]);
  });

  it("answers no url for a thread without a screenshot", async () => {
    const { backend } = setup({
      replies: { threads: { data: { screenshot_path: null }, error: null } },
    });
    expect(await backend.getScreenshotUrl(THREAD_ID)).toEqual({ ok: true, data: null });
  });

  it("signs the screenshot path for an hour", async () => {
    const path = `${DEMO_WORKSPACE_ID}/${THREAD_ID}.webp`;
    const { backend, mock } = setup({
      replies: { threads: { data: { screenshot_path: path }, error: null } },
    });
    expect(await backend.getScreenshotUrl(THREAD_ID)).toEqual({
      ok: true,
      data: "https://signed.example/x",
    });
    expect(mock.createSignedUrl).toHaveBeenCalledWith(path, SIGNED_URL_TTL_SECONDS);
  });

  it("reports a missing thread as not found", async () => {
    const { backend } = setup({ replies: { threads: { data: null, error: null } } });
    expect(await backend.getScreenshotUrl(THREAD_ID)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("has no ClickUp integration in the demo", async () => {
    const { backend } = setup();
    expect(await backend.getClickUpStatus(DEMO_WORKSPACE_ID)).toEqual({ ok: true, data: false });
    expect(await backend.createClickUpTask(THREAD_ID)).toMatchObject({
      ok: false,
      error: { code: "not_configured" },
    });
  });
});

describe("realtime subscription", () => {
  function subscribe() {
    const handlers: WidgetSubscriptionHandlers = {
      onEvent: vi.fn(),
      onSubscribed: vi.fn(),
      onDisconnected: vi.fn(),
    };
    const fake = setup();
    const handle = fake.backend.subscribe(SUBSCRIPTION, handlers);
    return { ...fake, handle, handlers };
  }

  it("listens to threads of the site and comments of the workspace", () => {
    const { listeners } = subscribe();
    expect(listeners.map(({ type, table, filter }) => ({ type, table, filter }))).toEqual([
      {
        type: "postgres_changes",
        table: "threads",
        filter: `site_id=eq.${SITE_ID}`,
      },
      {
        type: "postgres_changes",
        table: "comments",
        filter: `workspace_id=eq.${DEMO_WORKSPACE_ID}`,
      },
    ]);
  });

  it("turns row changes into widget events and reports the channel state", () => {
    const { listeners, sendStatus, handle, handlers } = subscribe();
    const [threads, comments] = listeners;

    threads?.callback({ eventType: "DELETE", new: {}, old: { id: THREAD_ID } });
    comments?.callback({ eventType: "INSERT", new: { thread_id: THREAD_ID }, old: {} });
    comments?.callback({ eventType: "INSERT", new: {}, old: {} });
    sendStatus("SUBSCRIBED");
    sendStatus("CHANNEL_ERROR");
    handle.update(PAGE_URL);
    handle.close();

    expect(handlers.onEvent).toHaveBeenCalledTimes(2);
    expect(handlers.onEvent).toHaveBeenNthCalledWith(1, {
      type: "threads.changed",
      threadId: THREAD_ID,
    });
    expect(handlers.onEvent).toHaveBeenNthCalledWith(2, {
      type: "comments.changed",
      threadId: THREAD_ID,
    });
    expect(handlers.onSubscribed).toHaveBeenCalledOnce();
    expect(handlers.onDisconnected).toHaveBeenCalledOnce();
  });

  it("removes the channel when the handle is closed", () => {
    const { handle, mock } = subscribe();
    handle.close();
    expect(mock.removeChannel).toHaveBeenCalledOnce();
  });
});

describe("preferences", () => {
  it("defaults to hiding resolved threads and remembers the choice per site", async () => {
    const { backend } = setup();
    expect(await backend.getPreference(SITE_ID)).toEqual({
      ok: true,
      data: { showResolved: false },
    });
    expect(await backend.setPreference(SITE_ID, true)).toEqual({ ok: true, data: null });
    expect(await backend.getPreference(SITE_ID)).toEqual({
      ok: true,
      data: { showResolved: true },
    });
    expect(await backend.getPreference("other-site")).toEqual({
      ok: true,
      data: { showResolved: false },
    });
    expect(window.localStorage.getItem(`${PREFERENCE_KEY_PREFIX}${SITE_ID}`)).toBe("true");
  });

  it("keeps working when local storage is unavailable", async () => {
    const { backend } = setup();
    const getItem = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(await backend.getPreference(SITE_ID)).toEqual({
      ok: true,
      data: { showResolved: false },
    });
    expect(await backend.setPreference(SITE_ID, true)).toEqual({ ok: true, data: null });
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
