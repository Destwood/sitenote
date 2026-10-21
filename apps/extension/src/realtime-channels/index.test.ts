import { describe, expect, it, vi } from "vitest";

import {
  createChannelFactory,
  type ChannelHandlers,
  type ChannelLike,
  type RealtimeClientLike,
} from ".";

const SITE_ID = "20000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";

function createFakeClient() {
  const registered: {
    filter: { table: string; filter: string; event: string; schema: string };
    callback: (payload: unknown) => void;
  }[] = [];
  let statusCallback: ((status: string) => void) | undefined;
  const topics: string[] = [];
  const channel: ChannelLike = {
    on(_type, filter, callback) {
      registered.push({ filter, callback });
      return channel;
    },
    subscribe(callback) {
      statusCallback = callback;
      return channel;
    },
  };
  const removed: ChannelLike[] = [];
  const setAuth = vi.fn(() => Promise.resolve());
  const client: RealtimeClientLike = {
    channel: (name) => {
      topics.push(name);
      return channel;
    },
    removeChannel: (target) => {
      removed.push(target);
      return Promise.resolve("ok");
    },
    realtime: { setAuth },
  };
  return {
    client,
    registered,
    topics,
    removed,
    channel,
    setAuth,
    status: (value: string) => statusCallback?.(value),
  };
}

function handlers() {
  return {
    onThread: vi.fn<ChannelHandlers["onThread"]>(),
    onComment: vi.fn<ChannelHandlers["onComment"]>(),
    onSubscribed: vi.fn<ChannelHandlers["onSubscribed"]>(),
  };
}

function threadEvent(registered: ReturnType<typeof createFakeClient>["registered"]) {
  const entry = registered.find((item) => item.filter.table === "threads");
  if (entry === undefined) {
    throw new Error("No threads subscription");
  }
  return entry.callback;
}

function commentEvent(registered: ReturnType<typeof createFakeClient>["registered"]) {
  const entry = registered.find((item) => item.filter.table === "comments");
  if (entry === undefined) {
    throw new Error("No comments subscription");
  }
  return entry.callback;
}

describe("createChannelFactory", () => {
  it("opens one channel per site with filtered changes on threads and comments", () => {
    const fake = createFakeClient();

    createChannelFactory(fake.client).open(
      { siteId: SITE_ID, workspaceId: WORKSPACE_ID },
      handlers(),
    );

    expect(fake.topics).toEqual([`sitenote:site:${SITE_ID}`]);
    expect(fake.registered.map((item) => item.filter)).toEqual([
      { event: "*", schema: "public", table: "threads", filter: `site_id=eq.${SITE_ID}` },
      {
        event: "*",
        schema: "public",
        table: "comments",
        filter: `workspace_id=eq.${WORKSPACE_ID}`,
      },
    ]);
  });

  it("reports thread inserts, updates and deletes with their page", () => {
    const fake = createFakeClient();
    const h = handlers();
    createChannelFactory(fake.client).open({ siteId: SITE_ID, workspaceId: WORKSPACE_ID }, h);
    const emit = threadEvent(fake.registered);

    emit({ eventType: "INSERT", new: { id: THREAD_ID, page_url: "https://a.test/x" }, old: {} });
    emit({ eventType: "UPDATE", new: { id: THREAD_ID, page_url: "https://a.test/x" }, old: {} });
    emit({ eventType: "DELETE", new: {}, old: { id: THREAD_ID } });

    expect(h.onThread.mock.calls).toEqual([
      [{ kind: "INSERT", id: THREAD_ID, pageUrl: "https://a.test/x" }],
      [{ kind: "UPDATE", id: THREAD_ID, pageUrl: "https://a.test/x" }],
      [{ kind: "DELETE", id: THREAD_ID, pageUrl: null }],
    ]);
  });

  it("ignores thread payloads that are malformed or carry no id", () => {
    const fake = createFakeClient();
    const h = handlers();
    createChannelFactory(fake.client).open({ siteId: SITE_ID, workspaceId: WORKSPACE_ID }, h);
    const emit = threadEvent(fake.registered);

    emit(null);
    emit("INSERT");
    emit({ eventType: "TRUNCATE", new: { id: THREAD_ID } });
    emit({ eventType: "INSERT", new: { page_url: "https://a.test" } });
    emit({ eventType: "INSERT", new: { id: 5 } });

    expect(h.onThread).not.toHaveBeenCalled();
  });

  it("reports the thread of a comment change and ignores payloads without one", () => {
    const fake = createFakeClient();
    const h = handlers();
    createChannelFactory(fake.client).open({ siteId: SITE_ID, workspaceId: WORKSPACE_ID }, h);
    const emit = commentEvent(fake.registered);

    emit({ eventType: "INSERT", new: { thread_id: THREAD_ID, body: "x" }, old: {} });
    emit({ eventType: "UPDATE", new: { thread_id: THREAD_ID }, old: {} });
    emit({ eventType: "DELETE", new: {}, old: { id: "x" } });
    emit({ eventType: "INSERT", new: { thread_id: 3 } });
    emit(undefined);

    expect(h.onComment.mock.calls).toEqual([[{ threadId: THREAD_ID }], [{ threadId: THREAD_ID }]]);
  });

  it("tells whether a subscription is a first join or a rejoin and ignores other statuses", () => {
    const fake = createFakeClient();
    const h = handlers();
    createChannelFactory(fake.client).open({ siteId: SITE_ID, workspaceId: WORKSPACE_ID }, h);

    fake.status("CHANNEL_ERROR");
    fake.status("TIMED_OUT");
    expect(h.onSubscribed).not.toHaveBeenCalled();

    fake.status("SUBSCRIBED");
    fake.status("CLOSED");
    fake.status("SUBSCRIBED");

    expect(h.onSubscribed.mock.calls).toEqual([[false], [true]]);
  });

  it("removes the channel when the handle is closed", () => {
    const fake = createFakeClient();

    createChannelFactory(fake.client)
      .open({ siteId: SITE_ID, workspaceId: WORKSPACE_ID }, handlers())
      .close();

    expect(fake.removed).toEqual([fake.channel]);
  });

  it("passes the access token to the realtime client", () => {
    const fake = createFakeClient();
    const factory = createChannelFactory(fake.client);

    factory.setAuth("token-1");
    factory.setAuth(null);

    expect(fake.setAuth.mock.calls).toEqual([["token-1"], [null]]);
  });
});
