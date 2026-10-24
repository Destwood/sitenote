import { describe, expect, it, vi } from "vitest";

import type {
  WidgetBackend,
  WidgetSubscription,
  WidgetSubscriptionHandle,
  WidgetSubscriptionHandlers,
} from "../backend";
import { failure, success, type MessageResult } from "../result";
import type { SiteInfo, ThreadRecord } from "../transport";

import { createPageSession, type PageSessionState } from ".";

const SITE: SiteInfo = {
  siteId: "20000000-0000-4000-8000-000000000001",
  workspaceId: "10000000-0000-4000-8000-000000000001",
  workspaceName: "Northwind",
  role: "member",
  userId: "00000000-0000-4000-8000-000000000002",
  captureErrors: true,
};
const ORIGIN = "https://example.test";
const PAGE = "https://example.test/pricing";
const OTHER_PAGE = "https://example.test/about";

function thread(id: string): ThreadRecord {
  return {
    id,
    siteId: SITE.siteId,
    pageUrl: PAGE,
    status: "open",
    anchor: null,
    author: { id: "u", displayName: "Ann", avatarUrl: null },
    createdAt: "2026-10-21T10:00:00.000Z",
    context: null,
    hasScreenshot: false,
    comments: [],
  };
}

const THREAD_A = thread("30000000-0000-4000-8000-000000000001");
const THREAD_B = thread("30000000-0000-4000-8000-000000000002");

type SubscribeCall = WidgetSubscriptionHandlers & { subscription: WidgetSubscription };

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup(responses: {
  site?: MessageResult<SiteInfo | null> | Promise<MessageResult<SiteInfo | null>>;
  lists?: (() => Promise<MessageResult<ThreadRecord[]>>)[];
}) {
  const states: PageSessionState[] = [];
  const requests: unknown[] = [];
  const lists = [...(responses.lists ?? [])];
  const connectionOptions: SubscribeCall[] = [];
  const connection: WidgetSubscriptionHandle = { update: vi.fn(), close: vi.fn() };
  let pageUrl: string | null = PAGE;
  const backend: Pick<WidgetBackend, "getSiteInfo" | "listThreads" | "subscribe"> = {
    getSiteInfo: (origin) => {
      requests.push({ method: "getSiteInfo", origin });
      return Promise.resolve(responses.site ?? success(SITE));
    },
    listThreads: (siteId, url) => {
      requests.push({ method: "listThreads", siteId, pageUrl: url });
      const next = lists.shift();
      return next === undefined ? Promise.resolve(success([])) : next();
    },
    subscribe: (subscription, handlers) => {
      connectionOptions.push({ subscription, ...handlers });
      return connection;
    },
  };
  const session = createPageSession({
    origin: ORIGIN,
    readPageUrl: () => pageUrl,
    backend,
    onState: (state) => states.push(state),
  });
  return {
    session,
    states,
    requests,
    connection,
    connectionOptions,
    setPage: (next: string | null) => {
      pageUrl = next;
    },
    last: () => states.at(-1),
  };
}

describe("start", () => {
  it("loads the site and the threads of the page and opens the connection", async () => {
    const { session, last, requests, connectionOptions } = setup({
      lists: [() => Promise.resolve(success([THREAD_A, THREAD_B]))],
    });

    await session.start();

    expect(requests).toEqual([
      { method: "getSiteInfo", origin: ORIGIN },
      { method: "listThreads", siteId: SITE.siteId, pageUrl: PAGE },
    ]);
    expect(last()).toEqual({
      status: "ready",
      site: SITE,
      threads: [THREAD_A, THREAD_B],
      loaded: true,
      live: false,
      error: null,
    });
    expect(connectionOptions).toHaveLength(1);
    expect(connectionOptions[0]?.subscription.siteId).toBe(SITE.siteId);
    expect(connectionOptions[0]?.subscription.workspaceId).toBe(SITE.workspaceId);
    expect(connectionOptions[0]?.subscription.getPageUrl()).toBe(PAGE);
  });

  it("starts in the starting state", async () => {
    const { session, states } = setup({});

    await session.start();

    expect(states[0]?.status).toBe("starting");
  });

  it("reports a disabled site without loading anything", async () => {
    const { session, last, requests, connectionOptions } = setup({ site: success(null) });

    await session.start();

    expect(last()).toMatchObject({ status: "disabled", site: null, threads: [] });
    expect(requests).toHaveLength(1);
    expect(connectionOptions).toEqual([]);
  });

  it("reports a signed-out user", async () => {
    const { session, last, connectionOptions } = setup({ site: failure("unauthorized") });

    await session.start();

    expect(last()).toMatchObject({ status: "signedOut", error: "unauthorized" });
    expect(connectionOptions).toEqual([]);
  });

  it("reports any other failure as an error with its code", async () => {
    const { session, last } = setup({ site: failure("network") });

    await session.start();

    expect(last()).toMatchObject({ status: "error", error: "network" });
  });

  it("keeps the site and reports an error when the thread list fails", async () => {
    const { session, last } = setup({ lists: [() => Promise.resolve(failure("network"))] });

    await session.start();

    expect(last()).toMatchObject({ status: "error", site: SITE, threads: [], error: "network" });
  });

  it("does not publish anything after it was stopped", async () => {
    const site = deferred<MessageResult<SiteInfo | null>>();
    const { session, states, connectionOptions } = setup({ site: site.promise });

    const starting = session.start();
    session.stop();
    site.resolve(success(SITE));
    await starting;

    expect(states.map((state) => state.status)).toEqual(["starting"]);
    expect(connectionOptions).toEqual([]);
  });
});

describe("live updates", () => {
  it("marks the session live on an acknowledgement and refetches", async () => {
    const { session, last, connectionOptions, requests } = setup({
      lists: [
        () => Promise.resolve(success([THREAD_A])),
        () => Promise.resolve(success([THREAD_A, THREAD_B])),
      ],
    });
    await session.start();

    connectionOptions[0]?.onSubscribed();
    await vi.waitFor(() => {
      expect(last()?.threads).toEqual([THREAD_A, THREAD_B]);
    });

    expect(last()?.live).toBe(true);
    expect(
      requests.filter((request) => (request as { method: string }).method === "listThreads"),
    ).toHaveLength(2);
  });

  it("marks the session as not live when the connection drops", async () => {
    const { session, last, connectionOptions } = setup({});
    await session.start();
    connectionOptions[0]?.onSubscribed();

    connectionOptions[0]?.onDisconnected();

    expect(last()?.live).toBe(false);
  });

  it.each([
    ["a thread", { type: "threads.changed", threadId: THREAD_A.id }],
    ["a comment", { type: "comments.changed", threadId: THREAD_A.id }],
  ] as const)("refetches the page when %s changes", async (_name, event) => {
    const { session, last, connectionOptions } = setup({
      lists: [() => Promise.resolve(success([])), () => Promise.resolve(success([THREAD_A]))],
    });
    await session.start();

    connectionOptions[0]?.onEvent(event);

    await vi.waitFor(() => {
      expect(last()?.threads).toEqual([THREAD_A]);
    });
  });

  it("coalesces a burst of events into one extra fetch", async () => {
    const first = deferred<MessageResult<ThreadRecord[]>>();
    const second = deferred<MessageResult<ThreadRecord[]>>();
    const { session, last, connectionOptions, requests } = setup({
      lists: [() => first.promise, () => second.promise],
    });
    const starting = session.start();
    await vi.waitFor(() => {
      expect(connectionOptions).toHaveLength(1);
    });

    connectionOptions[0]?.onEvent({ type: "threads.changed", threadId: THREAD_A.id });
    connectionOptions[0]?.onEvent({ type: "comments.changed", threadId: THREAD_A.id });
    connectionOptions[0]?.onEvent({ type: "threads.changed", threadId: THREAD_B.id });
    first.resolve(success([]));
    await vi.waitFor(() => {
      expect(
        requests.filter((request) => (request as { method: string }).method === "listThreads"),
      ).toHaveLength(2);
    });
    second.resolve(success([THREAD_B]));
    await starting;

    expect(last()?.threads).toEqual([THREAD_B]);
    expect(
      requests.filter((request) => (request as { method: string }).method === "listThreads"),
    ).toHaveLength(2);
  });

  it("goes back to disabled and stops when the site is disabled", async () => {
    const { session, last, connectionOptions, connection } = setup({
      lists: [() => Promise.resolve(success([THREAD_A]))],
    });
    await session.start();

    connectionOptions[0]?.onEvent({ type: "site.disabled" });

    expect(last()).toEqual({
      status: "disabled",
      site: null,
      threads: [],
      loaded: false,
      live: false,
      error: null,
    });
    expect(connection.close).toHaveBeenCalledTimes(1);
  });
});

describe("navigate", () => {
  it("tells the connection about the new page and loads its threads", async () => {
    const { session, last, setPage, connection, requests } = setup({
      lists: [() => Promise.resolve(success([THREAD_A])), () => Promise.resolve(success([]))],
    });
    await session.start();

    setPage(OTHER_PAGE);
    session.navigate();
    await vi.waitFor(() => {
      expect(last()?.threads).toEqual([]);
    });

    expect(connection.update).toHaveBeenCalledWith(OTHER_PAGE);
    expect(requests.at(-1)).toEqual({
      method: "listThreads",
      siteId: SITE.siteId,
      pageUrl: OTHER_PAGE,
    });
  });

  it("is not loaded while the threads of the new page are on their way", async () => {
    const slow = deferred<MessageResult<ThreadRecord[]>>();
    const { session, last, setPage } = setup({
      lists: [() => Promise.resolve(success([THREAD_A])), () => slow.promise],
    });
    await session.start();
    expect(last()?.loaded).toBe(true);

    setPage(OTHER_PAGE);
    session.navigate();

    expect(last()).toMatchObject({ loaded: false, threads: [THREAD_A] });
    slow.resolve(success([]));
    await vi.waitFor(() => {
      expect(last()).toMatchObject({ loaded: true, threads: [] });
    });
  });

  it("drops a list that was requested for the page the user has already left", async () => {
    const slow = deferred<MessageResult<ThreadRecord[]>>();
    const { session, last, setPage, requests, states } = setup({
      lists: [() => slow.promise, () => Promise.resolve(success([THREAD_B]))],
    });
    const started = session.start();
    await vi.waitFor(() => {
      expect(requests).toHaveLength(2);
    });

    setPage(OTHER_PAGE);
    session.navigate();
    slow.resolve(success([THREAD_A]));
    await started;
    await vi.waitFor(() => {
      expect(last()?.threads).toEqual([THREAD_B]);
    });

    expect(states.some((state) => state.threads.includes(THREAD_A))).toBe(false);
    expect(requests.at(-1)).toEqual({
      method: "listThreads",
      siteId: SITE.siteId,
      pageUrl: OTHER_PAGE,
    });
  });

  it("does nothing useful before the site is known", async () => {
    const { session, requests } = setup({ site: success(null) });
    await session.start();

    session.navigate();
    await session.refresh();

    expect(requests).toHaveLength(1);
  });
});

describe("stop", () => {
  it("closes the connection and ignores later results", async () => {
    const pending = deferred<MessageResult<ThreadRecord[]>>();
    const { session, states, connection, connectionOptions } = setup({
      lists: [() => Promise.resolve(success([])), () => pending.promise],
    });
    await session.start();
    connectionOptions[0]?.onEvent({ type: "threads.changed", threadId: THREAD_A.id });
    const count = states.length;

    session.stop();
    pending.resolve(success([THREAD_A]));
    await session.refresh();

    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(states).toHaveLength(count);
  });
});
