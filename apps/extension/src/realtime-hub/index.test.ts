import { describe, expect, it, vi } from "vitest";

import type { PageEvent } from "../messages";
import type { ChannelHandlers, ChannelScope } from "../realtime-channels";
import { createRealtimeHub, type HubPort, type RealtimeHubDeps } from ".";

const ORIGIN = "https://example.test";
const OTHER_ORIGIN = "https://other.test";
const SITE_ID = "20000000-0000-4000-8000-000000000001";
const OTHER_SITE_ID = "20000000-0000-4000-8000-000000000002";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const PAGE = "https://example.test/pricing";
const OTHER_PAGE = "https://example.test/about";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function subscribe(pageUrl = PAGE, siteId = SITE_ID) {
  return { type: "page.subscribe", siteId, workspaceId: WORKSPACE_ID, pageUrl };
}

function createPort(origin: string | null = ORIGIN) {
  const messageHandlers: ((message: unknown) => void)[] = [];
  const disconnectHandlers: (() => void)[] = [];
  const events: PageEvent[] = [];
  const state = { disconnected: false, failPosts: false };
  const port: HubPort = {
    origin,
    post(event) {
      if (state.failPosts) {
        throw new Error("Attempting to use a disconnected port object");
      }
      events.push(event);
    },
    disconnect() {
      state.disconnected = true;
    },
    onMessage(handler) {
      messageHandlers.push(handler);
    },
    onDisconnect(handler) {
      disconnectHandlers.push(handler);
    },
  };
  return {
    port,
    events,
    state,
    send(message: unknown) {
      for (const handler of messageHandlers) {
        handler(message);
      }
    },
    drop() {
      for (const handler of disconnectHandlers) {
        handler();
      }
    },
  };
}

function setup(overrides: Partial<RealtimeHubDeps> = {}) {
  const channels: {
    scope: ChannelScope;
    handlers: ChannelHandlers;
    close: ReturnType<typeof vi.fn>;
  }[] = [];
  const setAuth = vi.fn();
  const deps: RealtimeHubDeps = {
    factory: {
      open: (scope, handlers) => {
        const close = vi.fn();
        channels.push({ scope, handlers, close });
        return { close };
      },
      setAuth,
    },
    getEnabledSite: vi.fn((origin: string) =>
      Promise.resolve(
        origin === ORIGIN
          ? { siteId: SITE_ID, workspaceId: WORKSPACE_ID, captureErrors: true }
          : null,
      ),
    ),
    findThreadPage: vi.fn(() => Promise.resolve<string | null>(PAGE)),
    hasSession: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  };
  const hub = createRealtimeHub(deps);
  return { hub, deps, channels, setAuth };
}

async function join(hub: ReturnType<typeof setup>["hub"], pageUrl = PAGE) {
  const port = createPort();
  hub.attach(port.port);
  port.send(subscribe(pageUrl));
  await flush();
  return port;
}

describe("attach", () => {
  it("drops a port that does not come from a content script", () => {
    const { hub, channels } = setup();
    const port = createPort(null);

    hub.attach(port.port);

    expect(port.state.disconnected).toBe(true);
    expect(channels).toEqual([]);
  });

  it.each([
    ["a message that is not understood", { type: "page.hack" }],
    ["an update before a subscription", { type: "page.update", pageUrl: PAGE }],
    ["a subscription with a bad page url", { ...subscribe(), pageUrl: "https://example.test/a/" }],
    ["a string", "page.subscribe"],
  ])("drops a port that sends %s", async (_name, message) => {
    const { hub, channels } = setup();
    const port = createPort();
    hub.attach(port.port);

    port.send(message);
    await flush();

    expect(port.state.disconnected).toBe(true);
    expect(channels).toEqual([]);
  });

  it.each([
    ["a site that is not enabled for the origin", () => createPort(OTHER_ORIGIN), subscribe()],
    ["another site id", () => createPort(), subscribe(PAGE, OTHER_SITE_ID)],
    ["a page of another origin", () => createPort(), subscribe("https://other.test/x")],
  ])("refuses a subscription for %s", async (_name, makePort, message) => {
    const { hub, channels } = setup();
    const port = makePort();
    hub.attach(port.port);

    port.send(message);
    await flush();

    expect(port.state.disconnected).toBe(true);
    expect(port.events).toEqual([]);
    expect(channels).toEqual([]);
  });

  it("drops a port that subscribes twice", async () => {
    const { hub, channels } = setup();
    const first = await join(hub);

    first.send(subscribe());
    await flush();

    expect(first.state.disconnected).toBe(true);
    expect(channels).toHaveLength(1);
    expect(channels[0]?.close).toHaveBeenCalledTimes(1);
  });

  it("opens one channel for the site and acknowledges only once it is subscribed", async () => {
    const { hub, channels } = setup();

    const port = await join(hub);

    expect(channels).toHaveLength(1);
    expect(channels[0]?.scope).toEqual({ siteId: SITE_ID, workspaceId: WORKSPACE_ID });
    expect(port.events).toEqual([]);

    channels[0]?.handlers.onSubscribed(false);

    expect(port.events).toEqual([{ type: "page.subscribed" }]);
  });

  it("shares the channel between ports of the same site and acknowledges late joiners at once", async () => {
    const { hub, channels } = setup();
    const first = await join(hub);
    channels[0]?.handlers.onSubscribed(false);

    const second = await join(hub, OTHER_PAGE);

    expect(channels).toHaveLength(1);
    expect(first.events).toEqual([{ type: "page.subscribed" }]);
    expect(second.events).toEqual([{ type: "page.subscribed" }]);
  });

  it("acknowledges every subscriber again after a rejoin", async () => {
    const { hub, channels } = setup();
    const first = await join(hub);
    const second = await join(hub);
    channels[0]?.handlers.onSubscribed(false);

    channels[0]?.handlers.onSubscribed(true);

    expect(first.events).toEqual([{ type: "page.subscribed" }, { type: "page.subscribed" }]);
    expect(second.events).toEqual([{ type: "page.subscribed" }, { type: "page.subscribed" }]);
  });

  it("closes the channel when the last port leaves and opens a new one for the next port", async () => {
    const { hub, channels } = setup();
    const first = await join(hub);
    const second = await join(hub);

    first.drop();
    expect(channels[0]?.close).not.toHaveBeenCalled();
    second.drop();
    expect(channels[0]?.close).toHaveBeenCalledTimes(1);

    await join(hub);
    expect(channels).toHaveLength(2);
  });

  it("does not leak a subscriber when the port goes away during the permission lookup", async () => {
    let resolveEnabled: (value: {
      siteId: string;
      workspaceId: string;
      captureErrors: boolean;
    }) => void = () => undefined;
    const { hub, channels } = setup({
      getEnabledSite: () =>
        new Promise((resolve) => {
          resolveEnabled = resolve;
        }),
    });
    const port = createPort();
    hub.attach(port.port);
    port.send(subscribe());

    port.drop();
    resolveEnabled({ siteId: SITE_ID, workspaceId: WORKSPACE_ID, captureErrors: true });
    await flush();

    expect(channels).toEqual([]);
    expect(port.events).toEqual([]);
  });

  it("drops the port when the permission lookup fails", async () => {
    const { hub } = setup({ getEnabledSite: () => Promise.reject(new Error("storage")) });
    const port = createPort();
    hub.attach(port.port);

    port.send(subscribe());
    await flush();

    expect(port.state.disconnected).toBe(true);
  });

  it("acknowledges at once and opens no channel without a session", async () => {
    const { hub, channels } = setup({ hasSession: () => Promise.resolve(false) });

    const port = await join(hub);

    expect(channels).toEqual([]);
    expect(port.events).toEqual([{ type: "page.subscribed" }]);
  });
});

describe("thread changes", () => {
  it("tells the ports on the page of a changed thread and nobody else", async () => {
    const { hub, channels } = setup();
    const pricing = await join(hub, PAGE);
    const about = await join(hub, OTHER_PAGE);
    channels[0]?.handlers.onSubscribed(false);
    pricing.events.length = 0;
    about.events.length = 0;

    channels[0]?.handlers.onThread({ kind: "INSERT", id: THREAD_ID, pageUrl: PAGE });
    channels[0]?.handlers.onThread({ kind: "UPDATE", id: THREAD_ID, pageUrl: PAGE });

    expect(pricing.events).toEqual([
      { type: "threads.changed", threadId: THREAD_ID },
      { type: "threads.changed", threadId: THREAD_ID },
    ]);
    expect(about.events).toEqual([]);
  });

  it("follows a port that navigates to another page", async () => {
    const { hub, channels } = setup();
    const port = await join(hub, PAGE);
    channels[0]?.handlers.onSubscribed(false);
    port.events.length = 0;

    port.send({ type: "page.update", pageUrl: OTHER_PAGE });
    channels[0]?.handlers.onThread({ kind: "INSERT", id: THREAD_ID, pageUrl: PAGE });
    channels[0]?.handlers.onThread({ kind: "INSERT", id: THREAD_ID, pageUrl: OTHER_PAGE });

    expect(port.events).toEqual([{ type: "threads.changed", threadId: THREAD_ID }]);
  });

  it("drops a port that navigates to another origin", async () => {
    const { hub } = setup();
    const port = await join(hub);

    port.send({ type: "page.update", pageUrl: "https://other.test/x" });

    expect(port.state.disconnected).toBe(true);
  });

  it("tells the page of a deleted thread it knew about and ignores unknown ones", async () => {
    const { hub, channels } = setup();
    const port = await join(hub);
    channels[0]?.handlers.onSubscribed(false);
    port.events.length = 0;

    channels[0]?.handlers.onThread({ kind: "DELETE", id: THREAD_ID, pageUrl: null });
    expect(port.events).toEqual([]);

    channels[0]?.handlers.onThread({ kind: "INSERT", id: THREAD_ID, pageUrl: PAGE });
    channels[0]?.handlers.onThread({ kind: "DELETE", id: THREAD_ID, pageUrl: null });
    expect(port.events).toEqual([
      { type: "threads.changed", threadId: THREAD_ID },
      { type: "threads.changed", threadId: THREAD_ID },
    ]);
  });
});

describe("comment changes", () => {
  it("uses the thread index when the thread is known", async () => {
    const { hub, channels, deps } = setup();
    const port = await join(hub);
    channels[0]?.handlers.onSubscribed(false);
    channels[0]?.handlers.onThread({ kind: "INSERT", id: THREAD_ID, pageUrl: PAGE });
    port.events.length = 0;

    channels[0]?.handlers.onComment({ threadId: THREAD_ID });
    await flush();

    expect(port.events).toEqual([{ type: "comments.changed", threadId: THREAD_ID }]);
    expect(deps.findThreadPage).not.toHaveBeenCalled();
  });

  it("looks an unknown thread up once and then remembers its page", async () => {
    const { hub, channels, deps } = setup();
    const port = await join(hub);
    channels[0]?.handlers.onSubscribed(false);
    port.events.length = 0;

    channels[0]?.handlers.onComment({ threadId: THREAD_ID });
    await flush();
    channels[0]?.handlers.onComment({ threadId: THREAD_ID });
    await flush();

    expect(deps.findThreadPage).toHaveBeenCalledTimes(1);
    expect(port.events).toHaveLength(2);
  });

  it("stays silent when the thread is on another page or cannot be found", async () => {
    const { hub, channels, deps } = setup();
    const port = await join(hub, OTHER_PAGE);
    channels[0]?.handlers.onSubscribed(false);
    port.events.length = 0;

    channels[0]?.handlers.onComment({ threadId: THREAD_ID });
    await flush();
    vi.mocked(deps.findThreadPage).mockResolvedValueOnce(null);
    channels[0]?.handlers.onComment({ threadId: "30000000-0000-4000-8000-000000000009" });
    await flush();

    expect(port.events).toEqual([]);
  });

  it("survives a failing thread lookup", async () => {
    const { hub, channels, deps } = setup();
    const port = await join(hub);
    channels[0]?.handlers.onSubscribed(false);
    port.events.length = 0;
    vi.mocked(deps.findThreadPage).mockRejectedValueOnce(new Error("offline"));

    channels[0]?.handlers.onComment({ threadId: THREAD_ID });
    await flush();

    expect(port.events).toEqual([]);
  });
});

describe("delivery", () => {
  it("disconnects a port whose post fails and keeps serving the others", async () => {
    const { hub, channels } = setup();
    const broken = await join(hub);
    const healthy = await join(hub);
    channels[0]?.handlers.onSubscribed(false);
    healthy.events.length = 0;
    broken.state.failPosts = true;

    channels[0]?.handlers.onThread({ kind: "INSERT", id: THREAD_ID, pageUrl: PAGE });

    expect(broken.state.disconnected).toBe(true);
    expect(healthy.events).toEqual([{ type: "threads.changed", threadId: THREAD_ID }]);
  });
});

describe("onSession", () => {
  it("closes every channel on sign-out and reopens them on sign-in with the new token", async () => {
    const { hub, channels, setAuth } = setup();
    const port = await join(hub);
    channels[0]?.handlers.onSubscribed(false);
    port.events.length = 0;

    hub.onSession(null);
    expect(channels[0]?.close).toHaveBeenCalledTimes(1);

    hub.onSession({ accessToken: "token-2" });
    await flush();

    expect(setAuth).toHaveBeenCalledWith("token-2");
    expect(channels).toHaveLength(2);
    channels[1]?.handlers.onSubscribed(false);
    expect(port.events).toEqual([{ type: "page.subscribed" }]);
  });

  it("does not open a second channel when the token is only refreshed", async () => {
    const { hub, channels, setAuth } = setup();
    await join(hub);

    hub.onSession({ accessToken: "token-3" });
    await flush();

    expect(setAuth).toHaveBeenCalledWith("token-3");
    expect(channels).toHaveLength(1);
  });

  it("opens nothing for a site without ports", async () => {
    const { hub, channels } = setup();

    hub.onSession({ accessToken: "token" });
    await flush();

    expect(channels).toEqual([]);
  });
});

describe("notifyDisabled", () => {
  it("tells the ports of the origin, disconnects them and closes the channel", async () => {
    const { hub, channels } = setup();
    const port = await join(hub);
    channels[0]?.handlers.onSubscribed(false);
    port.events.length = 0;

    hub.notifyDisabled(ORIGIN);

    expect(port.events).toEqual([{ type: "site.disabled" }]);
    expect(port.state.disconnected).toBe(true);
    expect(channels[0]?.close).toHaveBeenCalledTimes(1);
  });

  it("leaves ports of other origins alone", async () => {
    const { hub, channels } = setup();
    const port = await join(hub);
    channels[0]?.handlers.onSubscribed(false);
    port.events.length = 0;

    hub.notifyDisabled(OTHER_ORIGIN);

    expect(port.events).toEqual([]);
    expect(port.state.disconnected).toBe(false);
    expect(channels[0]?.close).not.toHaveBeenCalled();
  });
});
