import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PageClientMessage } from "../messages";
import {
  INITIAL_BACKOFF_MS,
  MAX_BACKOFF_MS,
  openPageConnection,
  type ClientPort,
  type PageConnectionOptions,
} from ".";

const SITE_ID = "20000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const PAGE = "https://example.test/pricing";
const OTHER_PAGE = "https://example.test/about";

function createFakePort() {
  const messageListeners: ((message: unknown) => void)[] = [];
  const disconnectListeners: (() => void)[] = [];
  const posted: PageClientMessage[] = [];
  const disconnect = vi.fn();
  const port: ClientPort = {
    postMessage: (message) => posted.push(message),
    disconnect,
    onMessage: { addListener: (listener) => messageListeners.push(listener) },
    onDisconnect: { addListener: (listener) => disconnectListeners.push(listener) },
  };
  return {
    port,
    disconnect,
    posted,
    receive: (message: unknown) => {
      for (const listener of messageListeners) {
        listener(message);
      }
    },
    drop: () => {
      for (const listener of disconnectListeners) {
        listener();
      }
    },
  };
}

function setup(connect?: (name: string) => ClientPort) {
  const ports: ReturnType<typeof createFakePort>[] = [];
  const names: string[] = [];
  const onEvent = vi.fn();
  const onSubscribed = vi.fn();
  const onDisconnected = vi.fn();
  let pageUrl = PAGE;
  const options: PageConnectionOptions = {
    connect:
      connect ??
      ((name) => {
        names.push(name);
        const fake = createFakePort();
        ports.push(fake);
        return fake.port;
      }),
    subscription: { siteId: SITE_ID, workspaceId: WORKSPACE_ID, getPageUrl: () => pageUrl },
    onEvent,
    onSubscribed,
    onDisconnected,
  };
  const connection = openPageConnection(options);
  return {
    connection,
    ports,
    names,
    onEvent,
    onSubscribed,
    onDisconnected,
    setPage: (next: string) => {
      pageUrl = next;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("openPageConnection", () => {
  it("connects to the page port and subscribes with the current page", () => {
    const { ports, names } = setup();

    expect(names).toEqual(["sitenote:page"]);
    expect(ports[0]?.posted).toEqual([
      { type: "page.subscribe", siteId: SITE_ID, workspaceId: WORKSPACE_ID, pageUrl: PAGE },
    ]);
  });

  it("reports the acknowledgement and forwards change events", () => {
    const { ports, onEvent, onSubscribed } = setup();

    ports[0]?.receive({ type: "page.subscribed" });
    ports[0]?.receive({ type: "threads.changed", threadId: THREAD_ID });
    ports[0]?.receive({ type: "comments.changed", threadId: THREAD_ID });

    expect(onSubscribed).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls).toEqual([
      [{ type: "threads.changed", threadId: THREAD_ID }],
      [{ type: "comments.changed", threadId: THREAD_ID }],
    ]);
  });

  it("ignores messages that are not valid events", () => {
    const { ports, onEvent, onSubscribed } = setup();

    ports[0]?.receive({ type: "threads.changed" });
    ports[0]?.receive("page.subscribed");
    ports[0]?.receive(null);

    expect(onEvent).not.toHaveBeenCalled();
    expect(onSubscribed).not.toHaveBeenCalled();
  });

  it("sends an update when the page changes", () => {
    const { ports, connection } = setup();

    connection.update(OTHER_PAGE);

    expect(ports[0]?.posted.at(-1)).toEqual({ type: "page.update", pageUrl: OTHER_PAGE });
  });

  it("reconnects with a growing delay after a disconnect and subscribes with the page it is on now", () => {
    const { ports, setPage, onDisconnected } = setup();

    ports[0]?.drop();
    expect(onDisconnected).toHaveBeenCalledTimes(1);
    expect(ports).toHaveLength(1);

    setPage(OTHER_PAGE);
    vi.advanceTimersByTime(INITIAL_BACKOFF_MS - 1);
    expect(ports).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(ports).toHaveLength(2);
    expect(ports[1]?.posted[0]).toMatchObject({ type: "page.subscribe", pageUrl: OTHER_PAGE });

    ports[1]?.drop();
    vi.advanceTimersByTime(INITIAL_BACKOFF_MS * 2 - 1);
    expect(ports).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(ports).toHaveLength(3);
  });

  it("never waits longer than the maximum delay", () => {
    const { ports } = setup();

    for (let attempt = 0; attempt < 12; attempt += 1) {
      ports.at(-1)?.drop();
      vi.advanceTimersByTime(MAX_BACKOFF_MS);
    }
    const before = ports.length;
    ports.at(-1)?.drop();
    vi.advanceTimersByTime(MAX_BACKOFF_MS);

    expect(ports.length).toBe(before + 1);
  });

  it("starts the delay over once the background acknowledges", () => {
    const { ports } = setup();
    ports[0]?.drop();
    vi.advanceTimersByTime(INITIAL_BACKOFF_MS);
    ports[1]?.drop();
    vi.advanceTimersByTime(INITIAL_BACKOFF_MS * 2);
    expect(ports).toHaveLength(3);

    ports[2]?.receive({ type: "page.subscribed" });
    ports[2]?.drop();
    vi.advanceTimersByTime(INITIAL_BACKOFF_MS);

    expect(ports).toHaveLength(4);
  });

  it("acknowledges again after every reconnect", () => {
    const { ports, onSubscribed } = setup();
    ports[0]?.receive({ type: "page.subscribed" });
    ports[0]?.drop();
    vi.advanceTimersByTime(INITIAL_BACKOFF_MS);

    ports[1]?.receive({ type: "page.subscribed" });

    expect(onSubscribed).toHaveBeenCalledTimes(2);
  });

  it("stops for good when the site is disabled", () => {
    const { ports, onEvent } = setup();

    ports[0]?.receive({ type: "site.disabled" });
    ports[0]?.drop();
    vi.advanceTimersByTime(MAX_BACKOFF_MS * 2);

    expect(onEvent).toHaveBeenCalledExactlyOnceWith({ type: "site.disabled" });
    expect(ports).toHaveLength(1);
    expect(ports[0]?.disconnect).toHaveBeenCalledTimes(1);
  });

  it("closes the port, cancels a pending reconnect and does not reconnect again", () => {
    const { ports, connection } = setup();
    ports[0]?.drop();

    connection.close();
    vi.advanceTimersByTime(MAX_BACKOFF_MS * 2);

    expect(ports).toHaveLength(1);
  });

  it("disconnects the live port when closed", () => {
    const { ports, connection } = setup();

    connection.close();
    connection.close();
    connection.update(OTHER_PAGE);

    expect(ports[0]?.disconnect).toHaveBeenCalledTimes(1);
    expect(ports[0]?.posted).toHaveLength(1);
  });

  it("gives up quietly when the extension context is gone", () => {
    const connect = vi.fn(() => {
      throw new Error("Extension context invalidated.");
    });

    const { connection } = setup(connect);
    vi.advanceTimersByTime(MAX_BACKOFF_MS * 2);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(() => {
      connection.update(OTHER_PAGE);
      connection.close();
    }).not.toThrow();
  });
});
