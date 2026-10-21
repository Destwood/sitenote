import { createTextAnchor, type Anchor } from "@sitenote/core";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ORPHANED, type Resolution } from "../anchor-target";
import { failure, success, type MessageResult } from "../messages";
import type { PageConnectionOptions } from "../page-connection";
import type { CommentRecord, SiteInfo, ThreadRecord } from "../transport";
import {
  COMMENT_CURSOR_CSS,
  PENDING_ID,
  UNSUPPORTED_SELECTION_MESSAGE,
  createContentController,
  reconcileResolutions,
  type ContentController,
  type ContentControllerDeps,
} from ".";

const ME = "00000000-0000-4000-8000-000000000002";
const SITE: SiteInfo = {
  siteId: "20000000-0000-4000-8000-000000000001",
  workspaceId: "10000000-0000-4000-8000-000000000001",
  workspaceName: "Northwind",
  role: "member",
  userId: ME,
};
const PAGE = "http://localhost:3000";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const SECOND_THREAD_ID = "30000000-0000-4000-8000-000000000002";
const COMMENT_ID = "40000000-0000-4000-8000-000000000001";
const AUTHOR = { id: ME, displayName: "Me", avatarUrl: null };

let host: HTMLElement;
let controller: ContentController | null = null;
let under: Element | null = null;
const frames: (() => void)[] = [];

function element(selector: string): Element {
  const found = document.querySelector(selector);
  if (found === null) {
    throw new Error(`missing ${selector}`);
  }
  return found;
}

const CTA_ANCHOR: Anchor = {
  kind: "element",
  selectors: {
    id: "cta",
    css: "#cta",
    nthPath: "body > main:nth-of-type(1) > button:nth-of-type(1)",
  },
  fingerprint: { tag: "button", text: "Book a call", classes: [], width: 0, height: 0 },
  offset: { x: 0.5, y: 0.5 },
};

const COPY_ANCHOR: Anchor = {
  kind: "element",
  selectors: {
    id: "copy",
    css: "#copy",
    nthPath: "body > main:nth-of-type(1) > p:nth-of-type(1)",
  },
  fingerprint: {
    tag: "p",
    text: "The quick brown fox jumps over the lazy dog.",
    classes: [],
    width: 0,
    height: 0,
  },
  offset: { x: 0.5, y: 0.5 },
};

function textRange(start = 4, end = 19): Range {
  const node = element("#copy").firstChild;
  if (node === null) {
    throw new Error("missing text");
  }
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  return range;
}

function comment(overrides: Partial<CommentRecord> = {}): CommentRecord {
  return {
    id: COMMENT_ID,
    threadId: THREAD_ID,
    author: AUTHOR,
    body: "Hello",
    createdAt: "2026-10-21T10:00:00.000Z",
    editedAt: null,
    deleted: false,
    ...overrides,
  };
}

function thread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    id: THREAD_ID,
    siteId: SITE.siteId,
    pageUrl: PAGE,
    status: "open",
    anchor: CTA_ANCHOR,
    author: AUTHOR,
    createdAt: "2026-10-21T10:00:00.000Z",
    comments: [comment()],
    ...overrides,
  };
}

type Handler = (request: never) => MessageResult<unknown> | Promise<MessageResult<unknown>>;

interface Harness {
  controller: ContentController;
  send: Mock<(request: { type: string }) => Promise<MessageResult<unknown>>>;
  requests: () => { type: string }[];
  connection: { options: Omit<PageConnectionOptions, "connect"> | null; update: () => void };
  state: () => ReturnType<ContentController["store"]["getState"]>;
}

async function setup(
  threads: ThreadRecord[] = [],
  handlers: Record<string, Handler> = {},
  deps: Partial<ContentControllerDeps> = {},
): Promise<Harness> {
  const connection: Harness["connection"] = { options: null, update: vi.fn() };
  const send = vi.fn((request: { type: string }) => {
    const handler = handlers[request.type];
    if (handler !== undefined) {
      return Promise.resolve(handler(request as never));
    }
    if (request.type === "sites.forOrigin") {
      return Promise.resolve(success(SITE));
    }
    if (request.type === "threads.list") {
      return Promise.resolve(success(threads));
    }
    return Promise.resolve(failure("unknown"));
  });
  const created = createContentController({
    win: window,
    doc: document,
    origin: "http://localhost:3000",
    isOwn: (node) => node !== null && (node === host || host.contains(node)),
    send: send as unknown as ContentControllerDeps["send"],
    openConnection: (options) => {
      connection.options = options;
      return { update: connection.update, close: vi.fn() };
    },
    ...deps,
  });
  controller = created;
  await created.start();
  return {
    controller: created,
    send,
    requests: () => send.mock.calls.map((call) => call[0]),
    connection,
    state: () => created.store.getState(),
  };
}

beforeEach(() => {
  document.body.innerHTML =
    '<main><button id="cta">Book a call</button><p id="copy">The quick brown fox jumps over the lazy dog.</p></main>';
  host = document.createElement("sitenote-root");
  document.body.append(host);
  window.history.replaceState({}, "", "/");
  under = null;
  frames.length = 0;
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => under,
  });
  Object.defineProperty(document, "adoptedStyleSheets", {
    configurable: true,
    get: () => [],
    set: () => {
      throw new TypeError("blocked");
    },
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(() => {
      callback(0);
    });
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
});

afterEach(() => {
  controller?.stop();
  controller = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "elementFromPoint");
  Reflect.deleteProperty(document, "adoptedStyleSheets");
  document.getSelection()?.removeAllRanges();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("reconcileResolutions", () => {
  const resolved = (): Resolution => ({
    status: "resolved",
    target: { kind: "element", element: element("#cta"), offset: { x: 0, y: 0 } },
  });

  it("keeps a resolution whose target is still on the page", () => {
    const kept = resolved();
    const previous = new Map<string, Resolution>([[THREAD_ID, kept]]);

    const next = reconcileResolutions(previous, [thread()], document);

    expect(next).toBe(previous);
  });

  it("resolves a thread that has no resolution yet", () => {
    const next = reconcileResolutions(new Map(), [thread()], document);

    expect(next.get(THREAD_ID)?.status).toBe("resolved");
  });

  it("turns a resolution into an orphan when its element is gone", () => {
    const previous = new Map<string, Resolution>([[THREAD_ID, resolved()]]);
    element("#cta").remove();

    const next = reconcileResolutions(previous, [thread()], document);

    expect(next).not.toBe(previous);
    expect(next.get(THREAD_ID)).toBe(ORPHANED);
  });

  it("re-resolves an orphan when its element comes back", () => {
    const anchor = CTA_ANCHOR;
    const cta = element("#cta");
    cta.remove();
    const previous = new Map<string, Resolution>([[THREAD_ID, ORPHANED]]);
    expect(reconcileResolutions(previous, [thread({ anchor })], document)).toBe(previous);

    element("main").prepend(cta);
    const next = reconcileResolutions(previous, [thread({ anchor })], document);

    expect(next.get(THREAD_ID)?.status).toBe("resolved");
  });

  it("orphans a thread without a readable anchor", () => {
    const next = reconcileResolutions(new Map(), [thread({ anchor: null })], document);

    expect(next.get(THREAD_ID)).toBe(ORPHANED);
  });

  it("forgets threads that are no longer on the page", () => {
    const previous = new Map<string, Resolution>([[THREAD_ID, resolved()]]);

    const next = reconcileResolutions(previous, [], document);

    expect(next.size).toBe(0);
  });
});

describe("loading", () => {
  it("resolves the anchors of the loaded threads and reports the site", async () => {
    const { state } = await setup([thread()]);

    expect(state().status).toBe("ready");
    expect(state().site).toEqual(SITE);
    expect(state().threads).toHaveLength(1);
    expect(state().resolutions.get(THREAD_ID)?.status).toBe("resolved");
  });

  it("marks threads whose anchor does not match anything as orphaned", async () => {
    element("#cta").remove();

    const { state } = await setup([thread()]);

    expect(state().resolutions.get(THREAD_ID)).toBe(ORPHANED);
  });

  it("does nothing else when the site is not enabled", async () => {
    const { state, requests } = await setup([], { "sites.forOrigin": () => success(null) });

    expect(state().status).toBe("disabled");
    expect(requests().map((request) => request.type)).toEqual(["sites.forOrigin"]);
  });

  it("starts a realtime connection with the site and workspace", async () => {
    const { connection } = await setup([thread()]);

    expect(connection.options?.subscription.siteId).toBe(SITE.siteId);
    expect(connection.options?.subscription.workspaceId).toBe(SITE.workspaceId);
  });

  it("loads the threads again when a live event arrives", async () => {
    const lists = [[], [thread()]];
    const { connection, state } = await setup([], {
      "threads.list": () => success(lists.shift() ?? []),
    });
    expect(state().threads).toHaveLength(0);

    connection.options?.onEvent({ type: "threads.changed", threadId: THREAD_ID });

    await vi.waitFor(() => {
      expect(state().threads).toHaveLength(1);
    });
    expect(state().resolutions.get(THREAD_ID)?.status).toBe("resolved");
  });
});

describe("comment mode", () => {
  it("toggles the mode, the cursor style and the picker", async () => {
    const { controller: api, state } = await setup();

    expect(api.toggleCommentMode()).toBe(true);
    expect(state().commentMode).toBe(true);
    expect(document.head.querySelector("style")?.textContent).toBe(COMMENT_CURSOR_CSS);

    expect(api.toggleCommentMode()).toBe(false);
    expect(state().commentMode).toBe(false);
    expect(document.head.querySelector("style")).toBeNull();
  });

  it("starts a pending thread when an element is clicked in comment mode", async () => {
    const { controller: api, state } = await setup();
    api.toggleCommentMode();
    under = element("#cta");

    element("#cta").dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        detail: 1,
        clientX: 5,
        clientY: 5,
      }),
    );

    const pending = state().pending;
    expect(pending?.anchor.kind).toBe("element");
    expect(pending?.target.kind).toBe("element");
    expect(state().activeThreadId).toBeNull();
  });

  it("ignores clicks when comment mode is off", async () => {
    const { state } = await setup();
    under = element("#cta");

    element("#cta").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );

    expect(state().pending).toBeNull();
  });

  it("exits comment mode with Escape", async () => {
    const { controller: api, state } = await setup();
    api.toggleCommentMode();

    element("#copy").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(state().commentMode).toBe(false);
  });

  it("cancels a pending thread with the first Escape and exits with the second", async () => {
    const { controller: api, state } = await setup();
    api.toggleCommentMode();
    under = element("#cta");
    element("#cta").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    expect(state().pending).not.toBeNull();

    element("#copy").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(state().pending).toBeNull();
    expect(state().commentMode).toBe(true);

    element("#copy").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(state().commentMode).toBe(false);
  });

  it("leaves Escape to the extension UI when the event comes from inside it", async () => {
    const { controller: api, state } = await setup();
    api.toggleCommentMode();

    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(state().commentMode).toBe(true);
  });

  it("leaves Escape to the page when there is nothing to cancel", async () => {
    await setup();
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    const onPage = vi.fn();
    document.addEventListener("keydown", onPage);

    element("#copy").dispatchEvent(event);

    expect(onPage).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", onPage);
  });

  it("stops the page from seeing the Escape that it handled", async () => {
    const { controller: api } = await setup();
    api.toggleCommentMode();
    const onPage = vi.fn();
    document.addEventListener("keydown", onPage);

    element("#copy").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(onPage).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onPage);
  });

  it("clears the hover box when leaving comment mode", async () => {
    const { controller: api, state } = await setup();
    api.toggleCommentMode();

    api.exitCommentMode();

    expect(state().hover).toBeNull();
    expect(state().commentMode).toBe(false);
  });
});

describe("text comments", () => {
  async function withSelection(): Promise<Harness> {
    const harness = await setup();
    const range = textRange();
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup"));
    return harness;
  }

  it("keeps the selected range when the mouse is released", async () => {
    const { state } = await withSelection();

    expect(state().selection?.toString()).toBe("quick brown fox");
  });

  it("starts a pending text thread from the selection and clears the selection", async () => {
    const { controller: api, state } = await withSelection();

    api.startTextComment();

    expect(state().pending?.anchor.kind).toBe("text");
    expect(state().pending?.target.kind).toBe("text");
    expect(state().selection).toBeNull();
    expect(document.getSelection()?.rangeCount).toBe(0);
  });

  it("tells the user when the selection cannot be anchored", async () => {
    const { controller: api, state } = await withSelection();
    vi.spyOn(document, "body", "get").mockReturnValue(null as unknown as HTMLElement);

    api.startTextComment();

    expect(state().pending).toBeNull();
    expect(state().toasts.map((toast) => toast.message)).toEqual([UNSUPPORTED_SELECTION_MESSAGE]);
  });

  it("does nothing without a selection", async () => {
    const { controller: api, state } = await setup();

    api.startTextComment();

    expect(state().pending).toBeNull();
    expect(state().toasts).toHaveLength(0);
  });

  it("anchors the selection like the anchoring engine does", () => {
    const anchor = createTextAnchor(textRange(), document);

    expect(anchor?.quote.exact).toBe("quick brown fox");
  });
});

describe("creating a thread", () => {
  async function pendingHarness(handlers: Record<string, Handler> = {}): Promise<Harness> {
    const harness = await setup([], handlers);
    harness.controller.toggleCommentMode();
    under = element("#cta");
    element("#cta").dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        detail: 1,
        clientX: 5,
        clientY: 5,
      }),
    );
    return harness;
  }

  it("sends the anchor with an empty context and shows the created thread", async () => {
    const created = thread();
    const {
      controller: api,
      state,
      send,
    } = await pendingHarness({
      "threads.create": () => success(created),
    });

    await api.submitNewThread("  Looks off  ");

    const request = send.mock.calls.find((call) => call[0].type === "threads.create")?.[0];
    expect(request).toMatchObject({
      type: "threads.create",
      siteId: SITE.siteId,
      pageUrl: PAGE,
      context: {},
      body: "  Looks off  ",
      mentions: [],
    });
    expect(request).toMatchObject({ anchor: { kind: "element" } });
    expect(state().pending).toBeNull();
    expect(state().activeThreadId).toBe(THREAD_ID);
    expect(state().threads).toEqual([created]);
    expect(state().resolutions.get(THREAD_ID)?.status).toBe("resolved");
  });

  it("keeps the pending thread, shows the error and offers a retry when it fails", async () => {
    let fail = true;
    const created = thread();
    const { controller: api, state } = await pendingHarness({
      "threads.create": () => (fail ? failure("network") : success(created)),
    });

    await expect(api.submitNewThread("Looks off")).rejects.toThrow("could not reach the server");

    expect(state().pending).not.toBeNull();
    expect(state().panelError).toContain("could not reach the server");
    const toast = state().toasts[0];
    expect(toast?.variant).toBe("error");

    fail = false;
    toast?.onRetry?.();
    await vi.waitFor(() => {
      expect(state().threads).toEqual([created]);
    });
    expect(state().pending).toBeNull();
  });

  it("refuses a second submission while one is in flight", async () => {
    let release: (value: MessageResult<ThreadRecord>) => void = () => undefined;
    const { controller: api } = await pendingHarness({
      "threads.create": () =>
        new Promise<MessageResult<ThreadRecord>>((resolve) => {
          release = resolve;
        }),
    });

    const first = api.submitNewThread("One");
    await expect(api.submitNewThread("One")).rejects.toThrow();
    release(success(thread()));

    await expect(first).resolves.toBeUndefined();
  });

  it("does not add a thread created for a page the user has already left", async () => {
    let release: (value: MessageResult<ThreadRecord>) => void = () => undefined;
    const { controller: api, state } = await pendingHarness({
      "threads.create": () =>
        new Promise<MessageResult<ThreadRecord>>((resolve) => {
          release = resolve;
        }),
    });

    const submitted = api.submitNewThread("One");
    window.history.pushState({}, "", "/elsewhere");
    release(success(thread()));
    await submitted;

    expect(state().threads).toHaveLength(0);
  });

  it("rejects when there is no pending thread", async () => {
    const { controller: api } = await setup();

    await expect(api.submitNewThread("Hello")).rejects.toThrow();
  });

  it("closes the pending thread without sending anything", async () => {
    const { controller: api, state, requests } = await pendingHarness();

    api.closePanel();

    expect(state().pending).toBeNull();
    expect(requests().some((request) => request.type === "threads.create")).toBe(false);
  });
});

describe("comments and status", () => {
  const existing = thread();

  it("adds a reply to its thread", async () => {
    const reply = comment({ id: "40000000-0000-4000-8000-000000000002", body: "Reply" });
    const {
      controller: api,
      state,
      send,
    } = await setup([existing], {
      "comments.create": () => success(reply),
    });

    await api.reply(THREAD_ID, "Reply");

    expect(send).toHaveBeenCalledWith({
      type: "comments.create",
      threadId: THREAD_ID,
      body: "Reply",
      mentions: [],
    });
    expect(state().threads[0]?.comments.map((item) => item.body)).toEqual(["Hello", "Reply"]);
  });

  it("keeps the text and reports the error when a reply fails", async () => {
    const { controller: api, state } = await setup([existing], {
      "comments.create": () => failure("forbidden"),
    });

    await expect(api.reply(THREAD_ID, "Reply")).rejects.toThrow("do not have permission");

    expect(state().panelError).toContain("do not have permission");
    expect(state().threads[0]?.comments).toHaveLength(1);
  });

  it("replaces an edited comment", async () => {
    const edited = comment({ body: "Edited", editedAt: "2026-10-21T11:00:00.000Z" });
    const { controller: api, state } = await setup([existing], {
      "comments.update": () => success(edited),
    });

    await api.editComment(COMMENT_ID, "Edited");

    expect(state().threads[0]?.comments).toEqual([edited]);
  });

  it("shows a deleted comment as deleted", async () => {
    const removed = comment({ body: "", deleted: true });
    const { controller: api, state } = await setup([existing], {
      "comments.delete": () => success(removed),
    });

    await api.deleteComment(COMMENT_ID);

    expect(state().threads[0]?.comments[0]?.deleted).toBe(true);
  });

  it("rejects an edit and a delete that fail", async () => {
    const { controller: api } = await setup([existing], {
      "comments.update": () => failure("network"),
      "comments.delete": () => failure("not_found"),
    });

    await expect(api.editComment(COMMENT_ID, "x")).rejects.toThrow();
    await expect(api.deleteComment(COMMENT_ID)).rejects.toThrow("no longer exists");
  });

  it("resolves an open thread and reopens a resolved one", async () => {
    const statuses: string[] = [];
    const { controller: api, state } = await setup([existing], {
      "threads.setStatus": (request: { status: "open" | "resolved" }) => {
        statuses.push(request.status);
        return success({ ...existing, status: request.status });
      },
    });

    await api.toggleStatus(THREAD_ID);
    expect(state().threads[0]?.status).toBe("resolved");
    await api.toggleStatus(THREAD_ID);

    expect(statuses).toEqual(["resolved", "open"]);
    expect(state().threads[0]?.status).toBe("open");
  });

  it("shows an error toast with a retry when the status change fails", async () => {
    let fail = true;
    const { controller: api, state } = await setup([existing], {
      "threads.setStatus": () =>
        fail ? failure("network") : success({ ...existing, status: "resolved" as const }),
    });

    await api.toggleStatus(THREAD_ID);
    expect(state().threads[0]?.status).toBe("open");
    const toast = state().toasts[0];
    expect(toast?.variant).toBe("error");

    fail = false;
    toast?.onRetry?.();
    await vi.waitFor(() => {
      expect(state().threads[0]?.status).toBe("resolved");
    });
  });

  it("ignores a status change for an unknown thread", async () => {
    const { controller: api, requests } = await setup([existing]);

    await api.toggleStatus(SECOND_THREAD_ID);

    expect(requests().some((request) => request.type === "threads.setStatus")).toBe(false);
  });

  it("keeps at most three toasts and dismisses them by id", async () => {
    const { controller: api, state } = await setup([existing], {
      "threads.setStatus": () => failure("network"),
    });

    for (let count = 0; count < 5; count += 1) {
      await api.toggleStatus(THREAD_ID);
    }
    expect(state().toasts).toHaveLength(3);

    const [first] = state().toasts;
    api.dismissToast(first?.id ?? "");

    expect(state().toasts).toHaveLength(2);
  });
});

describe("selecting threads", () => {
  const first = thread();
  const second = thread({
    id: SECOND_THREAD_ID,
    createdAt: "2026-10-21T11:00:00.000Z",
    anchor: COPY_ANCHOR,
    comments: [],
  });

  it("opens a thread from its pin and closes it when the pin is pressed again", async () => {
    const { controller: api, state } = await setup([first, second]);

    api.togglePin(THREAD_ID);
    expect(state().activeThreadId).toBe(THREAD_ID);

    api.togglePin(THREAD_ID);
    expect(state().activeThreadId).toBeNull();
  });

  it("switches directly from one thread to another", async () => {
    const { controller: api, state } = await setup([first, second]);

    api.selectThread(THREAD_ID);
    api.selectThread(SECOND_THREAD_ID);

    expect(state().activeThreadId).toBe(SECOND_THREAD_ID);
  });

  it("ignores unknown threads and the pending pin", async () => {
    const { controller: api, state } = await setup([first]);

    api.selectThread(SECOND_THREAD_ID);
    api.togglePin(PENDING_ID);

    expect(state().activeThreadId).toBeNull();
  });

  it("scrolls an off-screen thread into view before opening it", async () => {
    const { controller: api } = await setup([first]);
    const scroll = vi.fn();
    element("#cta").scrollIntoView = scroll;

    api.selectThread(THREAD_ID);

    expect(scroll).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
  });

  it("opens an orphaned thread without scrolling", async () => {
    element("#cta").remove();
    const { controller: api, state } = await setup([first]);

    api.selectThread(THREAD_ID);

    expect(state().activeThreadId).toBe(THREAD_ID);
  });

  it("closes the panel when the open thread disappears from the page", async () => {
    let list = [first];
    const {
      controller: api,
      state,
      connection,
    } = await setup([], {
      "threads.list": () => success(list),
    });
    connection.options?.onEvent({ type: "threads.changed", threadId: THREAD_ID });
    await vi.waitFor(() => {
      expect(state().threads).toHaveLength(1);
    });
    api.selectThread(THREAD_ID);

    list = [];
    connection.options?.onEvent({ type: "threads.changed", threadId: THREAD_ID });

    await vi.waitFor(() => {
      expect(state().threads).toHaveLength(0);
    });
    expect(state().activeThreadId).toBeNull();
  });

  it("toggles the sidebar", async () => {
    const { controller: api, state } = await setup();

    api.toggleSidebar();
    expect(state().sidebarOpen).toBe(true);
    api.closeSidebar();
    expect(state().sidebarOpen).toBe(false);
    api.closeSidebar();
    expect(state().sidebarOpen).toBe(false);
  });
});

describe("the page changes under the overlay", () => {
  it("re-resolves threads after the DOM changes and orphans the ones that lost their element", async () => {
    vi.useFakeTimers();
    const { state } = await setup([thread()]);
    expect(state().resolutions.get(THREAD_ID)?.status).toBe("resolved");

    element("#cta").remove();
    await vi.advanceTimersByTimeAsync(300);

    expect(state().resolutions.get(THREAD_ID)).toBe(ORPHANED);
  });

  it("finds an orphan again when the element comes back", async () => {
    vi.useFakeTimers();
    const cta = element("#cta");
    cta.remove();
    const { state } = await setup([thread()]);
    expect(state().resolutions.get(THREAD_ID)).toBe(ORPHANED);

    element("main").prepend(cta);
    await vi.advanceTimersByTimeAsync(300);

    expect(state().resolutions.get(THREAD_ID)?.status).toBe("resolved");
  });

  it("ignores changes inside the extension host", async () => {
    vi.useFakeTimers();
    const { state } = await setup([thread()]);
    const before = state().resolutions;

    host.setAttribute("data-live", "true");
    await vi.advanceTimersByTimeAsync(300);

    expect(state().resolutions).toBe(before);
  });

  it("loads the threads of the new page when the URL changes", async () => {
    const other = thread({ id: SECOND_THREAD_ID, pageUrl: `${PAGE}/other` });
    const { state, requests, connection } = await setup([thread()], {
      "threads.list": (request: { pageUrl: string }) =>
        success(request.pageUrl === PAGE ? [thread()] : [other]),
    });
    expect(state().threads).toHaveLength(1);

    window.history.pushState({}, "", "/other");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(state().threads).toHaveLength(0);
    expect(state().activeThreadId).toBeNull();
    expect(connection.update).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(state().threads).toEqual([other]);
    });
    expect(requests().at(-1)).toMatchObject({ type: "threads.list", pageUrl: `${PAGE}/other` });
  });

  it("closes a pending thread when the page changes", async () => {
    const { controller: api, state } = await setup();
    api.toggleCommentMode();
    under = element("#cta");
    element("#cta").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    expect(state().pending).not.toBeNull();

    window.history.pushState({}, "", "/other");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(state().pending).toBeNull();
  });
});

describe("stop", () => {
  it("removes its listeners and styles", async () => {
    const { controller: api, state } = await setup([thread()]);
    api.toggleCommentMode();

    api.stop();
    under = element("#cta");
    element("#cta").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    element("#copy").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(state().pending).toBeNull();
    expect(state().commentMode).toBe(true);
    expect(document.head.querySelector("style")).toBeNull();
  });

  it("can be called more than once", async () => {
    const { controller: api } = await setup();

    api.stop();

    expect(() => {
      api.stop();
    }).not.toThrow();
  });
});
