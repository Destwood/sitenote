import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success } from "@sitenote/widget";
import {
  commentOnElement,
  listPageThreads,
  onAuthStateChanged,
  onNotificationsChanged,
  openPageThread,
  sendMessage,
  toggleCommentMode,
} from ".";

type Listener = (message: unknown, sender: { id?: string | undefined }) => undefined;

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  tabsSendMessage: vi.fn(),
  listeners: new Set<unknown>(),
}));

vi.mock("wxt/browser", () => ({
  browser: {
    runtime: {
      id: "own-extension-id",
      sendMessage: mocks.sendMessage,
      onMessage: {
        addListener: (listener: unknown) => mocks.listeners.add(listener),
        removeListener: (listener: unknown) => mocks.listeners.delete(listener),
      },
    },
    tabs: { sendMessage: mocks.tabsSendMessage },
  },
}));

const SIGNED_IN = {
  status: "signedIn",
  user: { id: "u", email: "a@b.test", displayName: "Ann", isAnonymous: false },
} as const;

function emit(message: unknown, sender: { id?: string | undefined }) {
  for (const listener of mocks.listeners) {
    (listener as Listener)(message, sender);
  }
}

beforeEach(() => {
  mocks.sendMessage.mockReset();
  mocks.tabsSendMessage.mockReset();
  mocks.listeners.clear();
});

describe("sendMessage", () => {
  it("sends the request and returns the validated response", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_IN));

    const response = await sendMessage({ type: "auth.getState" });

    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "auth.getState" });
    expect(response).toEqual(success(SIGNED_IN));
  });

  it("passes an error response through", async () => {
    mocks.sendMessage.mockResolvedValue(failure("rate_limited"));

    expect(await sendMessage({ type: "auth.sendCode", email: "a@b.test" })).toEqual(
      failure("rate_limited"),
    );
  });

  it("reports the background as unavailable when nothing answers", async () => {
    mocks.sendMessage.mockResolvedValue(undefined);

    expect(await sendMessage({ type: "auth.getState" })).toEqual(failure("unavailable"));
  });

  it("reports the background as unavailable when the response has the wrong shape", async () => {
    mocks.sendMessage.mockResolvedValue(success({ status: "pending" }));

    expect(await sendMessage({ type: "auth.getState" })).toEqual(failure("unavailable"));
  });

  it("reports the background as unavailable when sending throws", async () => {
    mocks.sendMessage.mockRejectedValue(new Error("Could not establish connection."));

    expect(await sendMessage({ type: "auth.signOut" })).toEqual(failure("unavailable"));
  });
});

describe("onAuthStateChanged", () => {
  it("delivers a state broadcast from this extension", () => {
    const listener = vi.fn();
    onAuthStateChanged(listener);

    emit({ type: "auth.stateChanged", state: SIGNED_IN }, { id: "own-extension-id" });

    expect(listener).toHaveBeenCalledExactlyOnceWith(SIGNED_IN);
  });

  it("ignores a broadcast from another sender", () => {
    const listener = vi.fn();
    onAuthStateChanged(listener);

    emit({ type: "auth.stateChanged", state: SIGNED_IN }, { id: "other-extension-id" });
    emit({ type: "auth.stateChanged", state: SIGNED_IN }, {});

    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores messages that are not valid broadcasts", () => {
    const listener = vi.fn();
    onAuthStateChanged(listener);

    emit({ type: "auth.stateChanged", state: { status: "x" } }, { id: "own-extension-id" });
    emit({ type: "auth.getState" }, { id: "own-extension-id" });
    emit("auth.stateChanged", { id: "own-extension-id" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribing", () => {
    const listener = vi.fn();
    const unsubscribe = onAuthStateChanged(listener);

    unsubscribe();
    emit({ type: "auth.stateChanged", state: SIGNED_IN }, { id: "own-extension-id" });

    expect(listener).not.toHaveBeenCalled();
    expect(mocks.listeners.size).toBe(0);
  });
});

describe("sendMessage with data requests", () => {
  const WORKSPACES = [
    { id: "10000000-0000-4000-8000-000000000001", name: "Northwind", role: "owner" },
  ];

  it("validates a data response against the schema of its request", async () => {
    mocks.sendMessage.mockResolvedValue(success(WORKSPACES));

    expect(await sendMessage({ type: "workspaces.list" })).toEqual(success(WORKSPACES));
  });

  it("reports the background as unavailable for data of the wrong shape", async () => {
    mocks.sendMessage.mockResolvedValue(success([{ id: "x" }]));

    expect(await sendMessage({ type: "workspaces.list" })).toEqual(failure("unavailable"));
  });

  it("passes a data error through", async () => {
    mocks.sendMessage.mockResolvedValue(failure("forbidden"));

    expect(await sendMessage({ type: "sites.disable", origin: "https://example.test" })).toEqual(
      failure("forbidden"),
    );
  });
});

describe("toggleCommentMode", () => {
  it("sends the toggle to the tab and returns the new state", async () => {
    mocks.tabsSendMessage.mockResolvedValue(success({ active: true }));

    expect(await toggleCommentMode(7)).toEqual(success({ active: true }));
    expect(mocks.tabsSendMessage).toHaveBeenCalledWith(7, { type: "commentMode.toggle" });
  });

  it("passes the content script's own failure through", async () => {
    mocks.tabsSendMessage.mockResolvedValue(failure("unauthorized"));

    expect(await toggleCommentMode(7)).toEqual(failure("unauthorized"));
  });

  it("says the page is unavailable when there is no content script", async () => {
    mocks.tabsSendMessage.mockRejectedValue(new Error("Could not establish connection."));

    expect(await toggleCommentMode(7)).toEqual(failure("page_unavailable"));
  });

  it("says the page is unavailable for an answer of the wrong shape", async () => {
    mocks.tabsSendMessage.mockResolvedValue({ active: true });

    expect(await toggleCommentMode(7)).toEqual(failure("page_unavailable"));
  });
});

describe("commentOnElement", () => {
  it("sends the request to the top frame of the tab and returns the result", async () => {
    mocks.tabsSendMessage.mockResolvedValue(success({ started: true }));

    expect(await commentOnElement(7)).toEqual(success({ started: true }));
    expect(mocks.tabsSendMessage).toHaveBeenCalledWith(
      7,
      { type: "commentMode.commentOnElement" },
      { frameId: 0 },
    );
  });

  it("passes the content script's own failure through", async () => {
    mocks.tabsSendMessage.mockResolvedValue(failure("unauthorized"));

    expect(await commentOnElement(7)).toEqual(failure("unauthorized"));
  });

  it("says the page is unavailable when there is no content script", async () => {
    mocks.tabsSendMessage.mockRejectedValue(new Error("Could not establish connection."));

    expect(await commentOnElement(7)).toEqual(failure("page_unavailable"));
  });

  it("says the page is unavailable for an answer of the wrong shape", async () => {
    mocks.tabsSendMessage.mockResolvedValue({ started: true });

    expect(await commentOnElement(7)).toEqual(failure("page_unavailable"));
  });
});

describe("listPageThreads", () => {
  const SUMMARY = {
    id: "30000000-0000-4000-8000-000000000001",
    number: 1,
    status: "open",
    excerpt: "Hello",
    authorName: "Max",
    replies: 0,
    detached: false,
  } as const;

  it("asks the top frame of the tab for its threads and returns them", async () => {
    mocks.tabsSendMessage.mockResolvedValue(success([SUMMARY]));

    expect(await listPageThreads(7)).toEqual(success([SUMMARY]));
    expect(mocks.tabsSendMessage).toHaveBeenCalledWith(
      7,
      { type: "page.listThreads" },
      { frameId: 0 },
    );
  });

  it("passes the content script's own failure through", async () => {
    mocks.tabsSendMessage.mockResolvedValue(failure("unauthorized"));

    expect(await listPageThreads(7)).toEqual(failure("unauthorized"));
  });

  it("says the page is unavailable when there is no content script", async () => {
    mocks.tabsSendMessage.mockRejectedValue(new Error("Could not establish connection."));

    expect(await listPageThreads(7)).toEqual(failure("page_unavailable"));
  });

  it("says the page is unavailable for an answer of the wrong shape", async () => {
    mocks.tabsSendMessage.mockResolvedValue(success([{ ...SUMMARY, replies: -1 }]));

    expect(await listPageThreads(7)).toEqual(failure("page_unavailable"));
  });
});

describe("openPageThread", () => {
  const THREAD_ID = "30000000-0000-4000-8000-000000000001";

  it("asks the top frame of the tab to open the thread and returns the result", async () => {
    mocks.tabsSendMessage.mockResolvedValue(success({ opened: true }));

    expect(await openPageThread(7, THREAD_ID)).toEqual(success({ opened: true }));
    expect(mocks.tabsSendMessage).toHaveBeenCalledWith(
      7,
      { type: "page.openThread", threadId: THREAD_ID },
      { frameId: 0 },
    );
  });

  it("passes the content script's own failure through", async () => {
    mocks.tabsSendMessage.mockResolvedValue(failure("page_unavailable"));

    expect(await openPageThread(7, THREAD_ID)).toEqual(failure("page_unavailable"));
  });

  it("says the page is unavailable when there is no content script", async () => {
    mocks.tabsSendMessage.mockRejectedValue(new Error("Could not establish connection."));

    expect(await openPageThread(7, THREAD_ID)).toEqual(failure("page_unavailable"));
  });

  it("says the page is unavailable for an answer of the wrong shape", async () => {
    mocks.tabsSendMessage.mockResolvedValue(success({ opened: "yes" }));

    expect(await openPageThread(7, THREAD_ID)).toEqual(failure("page_unavailable"));
  });
});

describe("onNotificationsChanged", () => {
  it("delivers the unread count of a broadcast from this extension", () => {
    const listener = vi.fn();
    onNotificationsChanged(listener);

    emit({ type: "notifications.changed", unread: 3 }, { id: "own-extension-id" });

    expect(listener).toHaveBeenCalledExactlyOnceWith(3);
  });

  it("ignores broadcasts from other senders and messages that are not broadcasts", () => {
    const listener = vi.fn();
    onNotificationsChanged(listener);

    emit({ type: "notifications.changed", unread: 3 }, { id: "other-extension-id" });
    emit({ type: "notifications.changed", unread: 3 }, {});
    emit({ type: "notifications.changed", unread: -1 }, { id: "own-extension-id" });
    emit({ type: "auth.getState" }, { id: "own-extension-id" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribing", () => {
    const listener = vi.fn();
    const unsubscribe = onNotificationsChanged(listener);

    unsubscribe();
    emit({ type: "notifications.changed", unread: 3 }, { id: "own-extension-id" });

    expect(listener).not.toHaveBeenCalled();
  });
});
