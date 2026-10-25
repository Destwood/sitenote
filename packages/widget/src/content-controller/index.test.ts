import { createTextAnchor, type Anchor, type ThreadContext } from "@sitenote/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ORPHANED, type Resolution } from "../anchor-target";
import type { WidgetBackend, WidgetSubscription, WidgetSubscriptionHandlers } from "../backend";
import type { PreferenceClient } from "../preference-client";
import { failure, type MessageResult, success } from "../result";
import type { ScreenshotTaker } from "../screenshot-taker";
import type { CommentRecord, MemberRecord, SiteInfo, ThreadRecord } from "../transport";
import {
  COMMENT_CURSOR_CSS,
  PREFERENCE_FAILED_MESSAGE,
  PENDING_ID,
  SCREENSHOT_FAILED_MESSAGE,
  THREAD_NOT_HERE_MESSAGE,
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
  captureErrors: true,
};
const PAGE = "http://localhost:3000";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const SECOND_THREAD_ID = "30000000-0000-4000-8000-000000000002";
const COMMENT_ID = "40000000-0000-4000-8000-000000000001";
const AUTHOR = { id: ME, displayName: "Me", avatarUrl: null };
const OLENA = "00000000-0000-4000-8000-000000000001";
const CAPTURE_ID = "60000000-0000-4000-8000-000000000001";
const CONTEXT: ThreadContext = {
  viewport: { width: 1440, height: 900 },
  devicePixelRatio: 2,
  pageTitle: "Northwind",
  url: "http://localhost:3000/",
  browser: { name: "Chrome", version: "130" },
  os: { name: "Windows", version: "11" },
  userAgent: "ua",
  consoleErrors: [],
  capturedAt: "2026-10-22T09:30:00.000Z",
};
const MEMBERS: MemberRecord[] = [
  { id: OLENA, displayName: "Olena Owner", avatarUrl: null, role: "owner" },
  { id: ME, displayName: "Me", avatarUrl: null, role: "member" },
];

function memoryPreference(initial = false) {
  return {
    load: vi.fn<PreferenceClient["load"]>().mockResolvedValue(initial),
    save: vi.fn<PreferenceClient["save"]>().mockResolvedValue(undefined),
  };
}

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
    mentions: [],
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
    context: null,
    hasScreenshot: false,
    comments: [comment()],
    ...overrides,
  };
}

type Method = keyof WidgetBackend;
type Handler = (...args: never[]) => unknown;
type Handlers = Partial<Record<Method, Handler>>;

interface Call {
  method: Method;
  args: unknown[];
}

interface Harness {
  controller: ContentController;
  calls: () => Call[];
  connection: {
    options: ({ subscription: WidgetSubscription } & WidgetSubscriptionHandlers) | null;
    update: () => void;
  };
  state: () => ReturnType<ContentController["store"]["getState"]>;
}

function defaultResult(method: Method, threads: ThreadRecord[]): unknown {
  switch (method) {
    case "getSiteInfo":
      return success(SITE);
    case "listThreads":
      return success(threads);
    case "listMembers":
      return success(MEMBERS);
    case "collectContext":
      return CONTEXT;
    default:
      return failure("unknown");
  }
}

function fakeBackend(
  handlers: Handlers,
  threads: ThreadRecord[],
  calls: Call[],
  connection: Harness["connection"],
): WidgetBackend {
  function respond<Value>(method: Method, args: unknown[]): Promise<Value> {
    calls.push({ method, args });
    const handler = handlers[method];
    const value: unknown =
      handler === undefined
        ? defaultResult(method, threads)
        : Reflect.apply(handler, undefined, args);
    return Promise.resolve(value as Value);
  }
  return {
    getSiteInfo: (origin) => respond("getSiteInfo", [origin]),
    listThreads: (siteId, pageUrl) => respond("listThreads", [siteId, pageUrl]),
    createThread: (input) => respond("createThread", [input]),
    setStatus: (threadId, status) => respond("setStatus", [threadId, status]),
    createComment: (input) => respond("createComment", [input]),
    updateComment: (input) => respond("updateComment", [input]),
    deleteComment: (commentId) => respond("deleteComment", [commentId]),
    listMembers: (workspaceId) => respond("listMembers", [workspaceId]),
    subscribe: (subscription, subscribed) => {
      connection.options = { subscription, ...subscribed };
      return { update: connection.update, close: vi.fn() };
    },
    captureScreenshot: (rect, devicePixelRatio) =>
      respond("captureScreenshot", [rect, devicePixelRatio]),
    getScreenshotUrl: (threadId) => respond("getScreenshotUrl", [threadId]),
    collectContext: () => respond("collectContext", []),
    getPreference: (siteId) => respond("getPreference", [siteId]),
    setPreference: (siteId, showResolved) => respond("setPreference", [siteId, showResolved]),
    getClickUpStatus: (workspaceId) => respond("getClickUpStatus", [workspaceId]),
    createClickUpTask: (threadId) => respond("createClickUpTask", [threadId]),
    getSelectionPlacement: () => respond("getSelectionPlacement", []),
  };
}

async function setup(
  threads: ThreadRecord[] = [],
  handlers: Handlers = {},
  deps: Partial<ContentControllerDeps> = {},
): Promise<Harness> {
  const connection: Harness["connection"] = { options: null, update: vi.fn() };
  const calls: Call[] = [];
  const created = createContentController({
    win: window,
    doc: document,
    origin: "http://localhost:3000",
    isOwn: (node) => node !== null && (node === host || host.contains(node)),
    backend: fakeBackend(handlers, threads, calls, connection),
    preference: memoryPreference(),
    screenshot: { take: vi.fn<ScreenshotTaker["take"]>().mockResolvedValue(CAPTURE_ID) },
    ...deps,
  });
  controller = created;
  await created.start();
  return {
    controller: created,
    calls: () => calls,
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

describe("thread named in the address", () => {
  it("makes the pin of the thread active and removes the hash, keeping the path and query", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    window.history.replaceState({}, "", `/docs/a?x=1#sitenote=${THREAD_ID}`);

    const { state } = await setup([thread()]);

    expect(state().activeThreadId).toBe(THREAD_ID);
    expect(state().sidebarOpen).toBe(false);
    expect(scroll).toHaveBeenCalledWith({ block: "center", inline: "nearest", behavior: "smooth" });
    expect(window.location.pathname).toBe("/docs/a");
    expect(window.location.search).toBe("?x=1");
    expect(window.location.hash).toBe("");
  });

  it("opens the thread of a hidden resolved comment without showing all resolved comments", async () => {
    window.history.replaceState({}, "", `/#sitenote=${THREAD_ID}`);

    const { state } = await setup([thread({ status: "resolved" })]);

    expect(state().activeThreadId).toBe(THREAD_ID);
    expect(state().showResolved).toBe(false);
  });

  it("opens the sidebar with an orphaned thread selected", async () => {
    element("#cta").remove();
    window.history.replaceState({}, "", `/#sitenote=${THREAD_ID}`);

    const { state } = await setup([thread()]);

    expect(state().resolutions.get(THREAD_ID)).toBe(ORPHANED);
    expect(state().activeThreadId).toBe(THREAD_ID);
    expect(state().sidebarOpen).toBe(true);
  });

  it("says so when the thread is not on this page and clears the hash", async () => {
    window.history.replaceState({}, "", `/#sitenote=${SECOND_THREAD_ID}`);

    const { state } = await setup([thread()]);

    expect(state().activeThreadId).toBeNull();
    expect(state().toasts.map((toast) => toast.message)).toEqual([THREAD_NOT_HERE_MESSAGE]);
    expect(window.location.hash).toBe("");
  });

  it("waits for the threads of the page before it opens the thread", async () => {
    let release: (value: MessageResult<ThreadRecord[]>) => void = () => undefined;
    const list = new Promise<MessageResult<ThreadRecord[]>>((resolve) => {
      release = resolve;
    });
    window.history.replaceState({}, "", `/#sitenote=${THREAD_ID}`);

    const starting = setup([thread()], { listThreads: () => list });
    await vi.waitFor(() => {
      expect(controller?.store.getState().status).toBe("ready");
    });

    expect(window.location.hash).toBe(`#sitenote=${THREAD_ID}`);
    expect(controller?.store.getState().activeThreadId).toBeNull();
    expect(controller?.store.getState().toasts).toEqual([]);

    release(success([thread()]));
    await starting;

    expect(controller?.store.getState().activeThreadId).toBe(THREAD_ID);
    expect(window.location.hash).toBe("");
  });

  it("opens the thread when the hash changes on the same page", async () => {
    const { state } = await setup([thread()]);

    window.history.replaceState({}, "", `/#sitenote=${THREAD_ID}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(state().activeThreadId).toBe(THREAD_ID);
    expect(window.location.hash).toBe("");
  });

  it("ignores a hash that does not name a thread", async () => {
    window.history.replaceState({}, "", "/#sitenote=not-a-thread");

    const { state } = await setup([thread()]);

    expect(state().activeThreadId).toBeNull();
    expect(state().toasts).toEqual([]);
    expect(window.location.hash).toBe("#sitenote=not-a-thread");
  });

  it("leaves the hash alone when the site is not enabled", async () => {
    window.history.replaceState({}, "", `/#sitenote=${THREAD_ID}`);

    const { state } = await setup([], { getSiteInfo: () => success(null) });

    expect(state().status).toBe("disabled");
    expect(state().toasts).toEqual([]);
    expect(window.location.hash).toBe(`#sitenote=${THREAD_ID}`);
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
    const { state, calls } = await setup([], { getSiteInfo: () => success(null) });

    expect(state().status).toBe("disabled");
    expect(calls().map((call) => call.method)).toEqual(["getSiteInfo"]);
  });

  it("starts a realtime connection with the site and workspace", async () => {
    const { connection } = await setup([thread()]);

    expect(connection.options?.subscription.siteId).toBe(SITE.siteId);
    expect(connection.options?.subscription.workspaceId).toBe(SITE.workspaceId);
  });

  it("loads the threads again when a live event arrives", async () => {
    const lists = [[], [thread()]];
    const { connection, state } = await setup([], {
      listThreads: () => success(lists.shift() ?? []),
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

    await vi.waitFor(() => {
      expect(state().pending).not.toBeNull();
    });
    const pending = state().pending;
    expect(pending?.anchor.kind).toBe("element");
    expect(pending?.target.kind).toBe("element");
    expect(pending?.captureId).toBe(CAPTURE_ID);
    expect(state().activeThreadId).toBeNull();
    expect(state().commentMode).toBe(false);
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

  it("leaves comment mode after a pick and Escape cancels the pending thread", async () => {
    const { controller: api, state } = await setup();
    api.toggleCommentMode();
    under = element("#cta");
    element("#cta").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    await vi.waitFor(() => {
      expect(state().pending).not.toBeNull();
    });
    expect(state().commentMode).toBe(false);

    element("#copy").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(state().pending).toBeNull();
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

describe("commenting on the right-clicked element", () => {
  function rightClick(target: Element): void {
    target.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
    );
  }

  it("returns false without a right-clicked element", async () => {
    const { controller: api, state } = await setup();

    expect(api.commentOnContextTarget()).toBe(false);
    expect(state().pending).toBeNull();
  });

  it("starts a pending thread on the right-clicked element and leaves comment mode", async () => {
    const { controller: api, state } = await setup();
    api.toggleCommentMode();
    rightClick(element("#cta"));

    expect(api.commentOnContextTarget()).toBe(true);

    await vi.waitFor(() => {
      expect(state().pending).not.toBeNull();
    });
    const pending = state().pending;
    expect(pending?.anchor.kind).toBe("element");
    expect(pending?.target).toMatchObject({ kind: "element", element: element("#cta") });
    expect(pending?.captureId).toBe(CAPTURE_ID);
    expect(state().commentMode).toBe(false);
  });

  it("starts the thread without comment mode being on", async () => {
    const { controller: api, state } = await setup();
    rightClick(element("#copy"));

    expect(api.commentOnContextTarget()).toBe(true);

    await vi.waitFor(() => {
      expect(state().pending).not.toBeNull();
    });
    expect(state().commentMode).toBe(false);
  });

  it("uses the stored target only once", async () => {
    const { controller: api } = await setup();
    rightClick(element("#cta"));

    expect(api.commentOnContextTarget()).toBe(true);
    expect(api.commentOnContextTarget()).toBe(false);
  });

  it("returns false when the right-clicked element has been removed", async () => {
    const { controller: api, state } = await setup();
    rightClick(element("#cta"));
    element("#cta").remove();

    expect(api.commentOnContextTarget()).toBe(false);
    expect(state().pending).toBeNull();
  });

  it("ignores a right-click on the extension itself", async () => {
    const { controller: api } = await setup();
    rightClick(host);

    expect(api.commentOnContextTarget()).toBe(false);
  });

  it("returns false when the site is not enabled", async () => {
    const { controller: api, state } = await setup([], { getSiteInfo: () => success(null) });
    rightClick(element("#cta"));

    expect(state().status).toBe("disabled");
    expect(api.commentOnContextTarget()).toBe(false);
  });
});

describe("text comments", () => {
  async function withSelection(deps: Partial<ContentControllerDeps> = {}): Promise<Harness> {
    const harness = await setup([], {}, deps);
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
    await vi.waitFor(() => {
      expect(state().pending).not.toBeNull();
    });

    expect(state().pending?.anchor.kind).toBe("text");
    expect(state().pending?.target.kind).toBe("text");
    expect(state().pending?.captureId).toBe(CAPTURE_ID);
    expect(state().selection).toBeNull();
    expect(document.getSelection()?.rangeCount).toBe(0);
  });

  it("keeps the selection while the screenshot is taken and clears it afterwards", async () => {
    let release: (value: string | null) => void = () => undefined;
    const take = vi.fn<ScreenshotTaker["take"]>(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { controller: api, state } = await withSelection({ screenshot: { take } });

    api.startTextComment();
    expect(document.getSelection()?.rangeCount).toBe(1);
    expect(take).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: "text" }));
    release(CAPTURE_ID);

    await vi.waitFor(() => {
      expect(state().pending).not.toBeNull();
    });
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
  async function pendingHarness(
    handlers: Record<string, Handler> = {},
    deps: Partial<ContentControllerDeps> = {},
  ): Promise<Harness> {
    const harness = await setup([], handlers, deps);
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
    await vi.waitFor(() => {
      expect(harness.state().pending).not.toBeNull();
    });
    return harness;
  }

  it("sends the anchor with the collected context and the capture id and shows the created thread", async () => {
    const created = thread({ hasScreenshot: true });
    const {
      controller: api,
      state,
      calls,
    } = await pendingHarness({
      createThread: () => success(created),
    });

    await api.submitNewThread({ body: "  Looks off  ", mentions: [] });

    const request = calls().find((call) => call.method === "createThread")?.args[0];
    expect(request).toMatchObject({
      siteId: SITE.siteId,
      pageUrl: PAGE,
      context: CONTEXT,
      captureId: CAPTURE_ID,
      body: "  Looks off  ",
      mentions: [],
    });
    expect(request).toMatchObject({ anchor: { kind: "element" } });
    expect(state().pending).toBeNull();
    expect(state().activeThreadId).toBe(THREAD_ID);
    expect(state().threads).toEqual([created]);
    expect(state().resolutions.get(THREAD_ID)?.status).toBe("resolved");
    expect(state().toasts).toHaveLength(0);
  });

  it("tells the user when the created thread has no screenshot", async () => {
    const { controller: api, state } = await pendingHarness({
      createThread: () => success(thread({ hasScreenshot: false })),
    });

    await api.submitNewThread({ body: "Looks off", mentions: [] });

    expect(state().toasts.map((toast) => [toast.message, toast.variant])).toEqual([
      [SCREENSHOT_FAILED_MESSAGE, "info"],
    ]);
    expect(state().threads).toHaveLength(1);
  });

  it("creates the thread without a capture id when the screenshot failed", async () => {
    const take = vi.fn<ScreenshotTaker["take"]>().mockResolvedValue(null);
    const created = thread();
    const { controller: api, calls } = await pendingHarness(
      { createThread: () => success(created) },
      { screenshot: { take } },
    );

    await api.submitNewThread({ body: "Looks off", mentions: [] });

    const request = calls().find((call) => call.method === "createThread")?.args[0];
    expect(request).not.toHaveProperty("captureId");
  });

  it("treats a screenshot that throws like a failed one", async () => {
    const take = vi.fn<ScreenshotTaker["take"]>().mockRejectedValue(new Error("boom"));
    const { state } = await pendingHarness({}, { screenshot: { take } });

    expect(state().pending?.captureId).toBeNull();
  });

  it("opens the pending thread only after the screenshot was taken", async () => {
    let release: (value: string | null) => void = () => undefined;
    const take = vi.fn<ScreenshotTaker["take"]>(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const harness = await setup([], {}, { screenshot: { take } });
    harness.controller.toggleCommentMode();
    under = element("#cta");
    element("#cta").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    expect(harness.state().pending).toBeNull();
    element("#cta").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    release(CAPTURE_ID);

    await vi.waitFor(() => {
      expect(harness.state().pending).not.toBeNull();
    });
    expect(take).toHaveBeenCalledTimes(1);
  });

  it("drops the pending thread when the page changed during the screenshot", async () => {
    let release: (value: string | null) => void = () => undefined;
    const take = vi.fn<ScreenshotTaker["take"]>(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const harness = await setup([], {}, { screenshot: { take } });
    harness.controller.toggleCommentMode();
    under = element("#cta");
    element("#cta").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    window.history.pushState({}, "", "/elsewhere");
    release(CAPTURE_ID);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.state().pending).toBeNull();
  });

  it("keeps the pending thread, shows the error and offers a retry when it fails", async () => {
    let fail = true;
    const created = thread();
    const { controller: api, state } = await pendingHarness({
      createThread: () => (fail ? failure("network") : success(created)),
    });

    await expect(api.submitNewThread({ body: "Looks off", mentions: [] })).rejects.toThrow(
      "could not reach the server",
    );

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
      createThread: () =>
        new Promise<MessageResult<ThreadRecord>>((resolve) => {
          release = resolve;
        }),
    });

    const first = api.submitNewThread({ body: "One", mentions: [] });
    await expect(api.submitNewThread({ body: "One", mentions: [] })).rejects.toThrow();
    release(success(thread()));

    await expect(first).resolves.toBeUndefined();
  });

  it("does not add a thread created for a page the user has already left", async () => {
    let release: (value: MessageResult<ThreadRecord>) => void = () => undefined;
    const {
      controller: api,
      state,
      calls,
    } = await pendingHarness({
      createThread: () =>
        new Promise<MessageResult<ThreadRecord>>((resolve) => {
          release = resolve;
        }),
    });

    const submitted = api.submitNewThread({ body: "One", mentions: [] });
    await vi.waitFor(() => {
      expect(calls().some((call) => call.method === "createThread")).toBe(true);
    });
    window.history.pushState({}, "", "/elsewhere");
    release(success(thread()));
    await submitted;

    expect(state().threads).toHaveLength(0);
  });

  it("rejects when there is no pending thread", async () => {
    const { controller: api } = await setup();

    await expect(api.submitNewThread({ body: "Hello", mentions: [] })).rejects.toThrow();
  });

  it("closes the pending thread without sending anything", async () => {
    const { controller: api, state, calls } = await pendingHarness();

    api.closePanel();

    expect(state().pending).toBeNull();
    expect(calls().some((call) => call.method === "createThread")).toBe(false);
  });
});

describe("comments and status", () => {
  const existing = thread();

  it("adds a reply to its thread", async () => {
    const reply = comment({ id: "40000000-0000-4000-8000-000000000002", body: "Reply" });
    const {
      controller: api,
      state,
      calls,
    } = await setup([existing], {
      createComment: () => success(reply),
    });

    await api.reply(THREAD_ID, { body: "Reply", mentions: [] });

    expect(calls()).toContainEqual({
      method: "createComment",
      args: [{ threadId: THREAD_ID, body: "Reply", mentions: [] }],
    });
    expect(state().threads[0]?.comments.map((item) => item.body)).toEqual(["Hello", "Reply"]);
  });

  it("keeps the text and reports the error when a reply fails", async () => {
    const { controller: api, state } = await setup([existing], {
      createComment: () => failure("forbidden"),
    });

    await expect(api.reply(THREAD_ID, { body: "Reply", mentions: [] })).rejects.toThrow(
      "do not have permission",
    );

    expect(state().panelError).toContain("do not have permission");
    expect(state().threads[0]?.comments).toHaveLength(1);
  });

  it("replaces an edited comment", async () => {
    const edited = comment({ body: "Edited", editedAt: "2026-10-21T11:00:00.000Z" });
    const { controller: api, state } = await setup([existing], {
      updateComment: () => success(edited),
    });

    await api.editComment(COMMENT_ID, "Edited");

    expect(state().threads[0]?.comments).toEqual([edited]);
  });

  it("shows a deleted comment as deleted", async () => {
    const removed = comment({ body: "", deleted: true });
    const { controller: api, state } = await setup([existing], {
      deleteComment: () => success(removed),
    });

    await api.deleteComment(COMMENT_ID);

    expect(state().threads[0]?.comments[0]?.deleted).toBe(true);
  });

  it("rejects an edit and a delete that fail", async () => {
    const { controller: api } = await setup([existing], {
      updateComment: () => failure("network"),
      deleteComment: () => failure("not_found"),
    });

    await expect(api.editComment(COMMENT_ID, "x")).rejects.toThrow();
    await expect(api.deleteComment(COMMENT_ID)).rejects.toThrow("no longer exists");
  });

  it("resolves an open thread and reopens a resolved one", async () => {
    const statuses: string[] = [];
    const { controller: api, state } = await setup([existing], {
      setStatus: (_threadId: string, status: "open" | "resolved") => {
        statuses.push(status);
        return success({ ...existing, status });
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
      setStatus: () =>
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
    const { controller: api, calls } = await setup([existing]);

    await api.toggleStatus(SECOND_THREAD_ID);

    expect(calls().some((call) => call.method === "setStatus")).toBe(false);
  });

  it("keeps at most three toasts and dismisses them by id", async () => {
    const { controller: api, state } = await setup([existing], {
      setStatus: () => failure("network"),
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

    expect(scroll).toHaveBeenCalledWith({ block: "center", inline: "nearest", behavior: "auto" });
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
      listThreads: () => success(list),
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
    const { state, calls, connection } = await setup([thread()], {
      listThreads: (_siteId: string, pageUrl: string) =>
        success(pageUrl === PAGE ? [thread()] : [other]),
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
    expect(calls().at(-1)).toMatchObject({
      method: "listThreads",
      args: [expect.any(String), `${PAGE}/other`],
    });
  });

  it("closes a pending thread when the page changes", async () => {
    const { controller: api, state } = await setup();
    api.toggleCommentMode();
    under = element("#cta");
    element("#cta").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    await vi.waitFor(() => {
      expect(state().pending).not.toBeNull();
    });

    window.history.pushState({}, "", "/other");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(state().pending).toBeNull();
  });
});

describe("selection placement", () => {
  it("places the selection button below the text by default", async () => {
    const { state } = await setup([thread()]);

    expect(state().selectionPlacement).toBe("below");
  });

  it("loads the stored placement when the page is activated", async () => {
    const { state } = await setup([thread()], { getSelectionPlacement: () => success("above") });

    await vi.waitFor(() => {
      expect(state().selectionPlacement).toBe("above");
    });
  });

  it("refreshes the placement when the window gets focus", async () => {
    let placement: "below" | "above" = "below";
    const { state } = await setup([thread()], {
      getSelectionPlacement: () => success(placement),
    });

    placement = "above";
    window.dispatchEvent(new Event("focus"));

    await vi.waitFor(() => {
      expect(state().selectionPlacement).toBe("above");
    });
  });

  it("keeps the current placement when the stored one cannot be read", async () => {
    const { state, calls } = await setup([thread()], {
      getSelectionPlacement: () => failure("unavailable"),
    });

    await vi.waitFor(() => {
      expect(calls().map((call) => call.method)).toContain("getSelectionPlacement");
    });
    expect(state().selectionPlacement).toBe("below");
  });

  it("keeps the default when the backend cannot report the placement", async () => {
    const backend = fakeBackend({}, [thread()], [], { options: null, update: vi.fn() });
    Reflect.deleteProperty(backend, "getSelectionPlacement");

    const { state } = await setup([thread()], {}, { backend });

    expect(state().status).toBe("ready");
    expect(state().selectionPlacement).toBe("below");
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

describe("members and mentions", () => {
  it("loads the members of the workspace once the site is known", async () => {
    const { state, calls } = await setup([thread()]);

    await vi.waitFor(() => {
      expect(state().members).toEqual(MEMBERS);
    });
    expect(calls()).toContainEqual({ method: "listMembers", args: [SITE.workspaceId] });
  });

  it("does not ask for members when the site is not enabled", async () => {
    const { calls } = await setup([], { getSiteInfo: () => success(null) });

    expect(calls().map((call) => call.method)).not.toContain("listMembers");
  });

  it("keeps working without members when the request fails", async () => {
    const { state, controller: api } = await setup([thread()], {
      listMembers: () => failure("network"),
    });

    api.selectThread(THREAD_ID);

    expect(state().members).toEqual([]);
    expect(state().activeThreadId).toBe(THREAD_ID);
  });

  it("keeps the same list when the members did not change", async () => {
    const { state, controller: api } = await setup([thread()]);
    await vi.waitFor(() => {
      expect(state().members).toEqual(MEMBERS);
    });
    const before = state().members;

    api.selectThread(THREAD_ID);
    await Promise.resolve();

    expect(state().members).toBe(before);
  });

  it("asks again when a thread or a new comment is opened and takes up changes", async () => {
    const lists: MemberRecord[][] = [[], MEMBERS];
    const {
      controller: api,
      state,
      calls,
    } = await setup([thread()], {
      listMembers: () => success(lists.shift() ?? MEMBERS),
    });
    expect(state().members).toEqual([]);

    api.selectThread(THREAD_ID);

    await vi.waitFor(() => {
      expect(state().members).toEqual(MEMBERS);
    });
    expect(calls().filter((call) => call.method === "listMembers")).toHaveLength(2);
  });

  it("sends the picked mentions with a new thread", async () => {
    const created = thread({ comments: [comment({ body: "@Olena Owner hi", mentions: [OLENA] })] });
    const {
      controller: api,
      calls,
      state,
    } = await setup([], { createThread: () => success(created) });
    api.toggleCommentMode();
    under = element("#cta");
    element("#cta").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    await vi.waitFor(() => {
      expect(state().pending).not.toBeNull();
    });

    await api.submitNewThread({ body: "@Olena Owner hi", mentions: [OLENA] });

    expect(calls()).toContainEqual({
      method: "createThread",
      args: [expect.objectContaining({ body: "@Olena Owner hi", mentions: [OLENA] })],
    });
  });

  it("sends the picked mentions with a reply", async () => {
    const reply = comment({
      id: "40000000-0000-4000-8000-000000000002",
      body: "@Olena Owner ping",
      mentions: [OLENA],
    });
    const {
      controller: api,
      calls,
      state,
    } = await setup([thread()], {
      createComment: () => success(reply),
    });

    await api.reply(THREAD_ID, { body: "@Olena Owner ping", mentions: [OLENA] });

    expect(calls()).toContainEqual({
      method: "createComment",
      args: [{ threadId: THREAD_ID, body: "@Olena Owner ping", mentions: [OLENA] }],
    });
    expect(state().threads[0]?.comments.at(-1)?.mentions).toEqual([OLENA]);
  });
});

describe("showing resolved threads", () => {
  const resolvedThread = () => thread({ status: "resolved" });

  class VisibleObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {}

    observe(target: Element): void {
      queueMicrotask(() => {
        this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      });
    }

    unobserve(): void {
      return;
    }

    disconnect(): void {
      return;
    }
  }

  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", VisibleObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function flushFrames(): Promise<void> {
    for (let round = 0; round < 3; round += 1) {
      await Promise.resolve();
      for (const frame of frames.splice(0)) {
        frame();
      }
    }
  }

  it("hides resolved pins by default and shows them when the toggle is on", async () => {
    const { controller: api, state } = await setup([resolvedThread()]);
    await flushFrames();
    expect(state().showResolved).toBe(false);
    expect(state().positions.has(THREAD_ID)).toBe(false);

    api.setShowResolved(true);
    await flushFrames();

    expect(state().showResolved).toBe(true);
    expect(state().positions.has(THREAD_ID)).toBe(true);

    api.setShowResolved(false);
    await flushFrames();

    expect(state().positions.has(THREAD_ID)).toBe(false);
  });

  it("always tracks open threads and the resolved thread that is open in the panel", async () => {
    const { controller: api, state } = await setup([
      resolvedThread(),
      thread({ id: SECOND_THREAD_ID, anchor: COPY_ANCHOR, createdAt: "2026-10-21T11:00:00.000Z" }),
    ]);
    await flushFrames();
    expect(state().positions.has(SECOND_THREAD_ID)).toBe(true);
    expect(state().positions.has(THREAD_ID)).toBe(false);

    api.selectThread(THREAD_ID);
    await flushFrames();

    expect(state().positions.has(THREAD_ID)).toBe(true);
  });

  it("restores the saved choice for the site", async () => {
    const preference = memoryPreference(true);
    const { state } = await setup([resolvedThread()], {}, { preference });

    await vi.waitFor(() => {
      expect(state().showResolved).toBe(true);
    });
    expect(preference.load).toHaveBeenCalledExactlyOnceWith(SITE.siteId);
  });

  it("saves every change for the site", async () => {
    const preference = memoryPreference();
    const { controller: api } = await setup([resolvedThread()], {}, { preference });

    api.setShowResolved(true);
    api.setShowResolved(true);
    api.setShowResolved(false);

    expect(preference.save.mock.calls).toEqual([
      [SITE.siteId, true],
      [SITE.siteId, false],
    ]);
  });

  it("tells the user when the choice could not be saved but keeps it for this visit", async () => {
    const preference = memoryPreference();
    preference.save.mockRejectedValue(new Error("quota"));
    const { controller: api, state } = await setup([resolvedThread()], {}, { preference });

    api.setShowResolved(true);

    await vi.waitFor(() => {
      expect(state().toasts.map((toast) => toast.message)).toEqual([PREFERENCE_FAILED_MESSAGE]);
    });
    expect(state().showResolved).toBe(true);
  });

  it("does not override a choice made before the saved one arrived", async () => {
    const preference = memoryPreference();
    let release: (value: boolean) => void = () => undefined;
    preference.load.mockReturnValue(
      new Promise<boolean>((resolve) => {
        release = resolve;
      }),
    );
    const { controller: api, state } = await setup([resolvedThread()], {}, { preference });

    api.setShowResolved(true);
    release(false);
    await Promise.resolve();
    await Promise.resolve();

    expect(state().showResolved).toBe(true);
  });
});

describe("screenshots of existing threads", () => {
  const withScreenshot = thread({ hasScreenshot: true });

  it("calls the signed url when a thread with a screenshot is opened", async () => {
    const {
      controller: api,
      state,
      calls,
    } = await setup([withScreenshot], {
      getScreenshotUrl: () => success("https://storage.test/s.webp?token=1"),
    });

    api.selectThread(THREAD_ID);

    expect(state().screenshots.get(THREAD_ID)).toEqual({ status: "loading" });
    await vi.waitFor(() => {
      expect(state().screenshots.get(THREAD_ID)).toEqual({
        status: "ready",
        url: "https://storage.test/s.webp?token=1",
      });
    });
    expect(calls()).toContainEqual({ method: "getScreenshotUrl", args: [THREAD_ID] });
  });

  it("marks the screenshot unavailable when the url cannot be fetched or is empty", async () => {
    const failed = await setup([withScreenshot], {
      getScreenshotUrl: () => failure("network"),
    });
    failed.controller.selectThread(THREAD_ID);
    await vi.waitFor(() => {
      expect(failed.state().screenshots.get(THREAD_ID)).toEqual({ status: "unavailable" });
    });
    failed.controller.stop();

    const empty = await setup([withScreenshot], {
      getScreenshotUrl: () => success(null),
    });
    empty.controller.selectThread(THREAD_ID);
    await vi.waitFor(() => {
      expect(empty.state().screenshots.get(THREAD_ID)).toEqual({ status: "unavailable" });
    });
  });

  it("does not ask for a screenshot when the thread has none", async () => {
    const { controller: api, calls } = await setup([thread()]);

    api.selectThread(THREAD_ID);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls().some((call) => call.method === "getScreenshotUrl")).toBe(false);
  });

  it("keeps the shown screenshot while it is refreshed on the next opening", async () => {
    let calls = 0;
    const { controller: api, state } = await setup([withScreenshot], {
      getScreenshotUrl: () => success(`https://storage.test/s.webp?token=${String((calls += 1))}`),
    });
    api.selectThread(THREAD_ID);
    await vi.waitFor(() => {
      expect(state().screenshots.get(THREAD_ID)?.status).toBe("ready");
    });

    api.closePanel();
    api.selectThread(THREAD_ID);

    expect(state().screenshots.get(THREAD_ID)?.status).toBe("ready");
    await vi.waitFor(() => {
      expect(state().screenshots.get(THREAD_ID)).toEqual({
        status: "ready",
        url: "https://storage.test/s.webp?token=2",
      });
    });
  });
});
