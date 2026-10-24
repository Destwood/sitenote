import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Anchor, ThreadContext } from "@sitenote/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WidgetBackend } from "../backend";
import { failure, success } from "../result";
import type { SiteInfo, ThreadRecord } from "../transport";
import { mountWidget, type WidgetHandle } from ".";

const ME = "00000000-0000-4000-8000-000000000002";
const SITE: SiteInfo = {
  siteId: "20000000-0000-4000-8000-000000000001",
  workspaceId: "10000000-0000-4000-8000-000000000001",
  workspaceName: "Northwind",
  role: "member",
  userId: ME,
  captureErrors: false,
};
const PAGE = "http://localhost:3000";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const AUTHOR = { id: ME, displayName: "Me", avatarUrl: null };
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
const CONTEXT: ThreadContext = {
  viewport: { width: 1440, height: 900 },
  devicePixelRatio: 2,
  pageTitle: "Northwind",
  url: PAGE,
  browser: { name: "Chrome", version: "130" },
  os: { name: "Windows", version: "11" },
  userAgent: "ua",
  consoleErrors: [],
  capturedAt: "2026-10-22T09:30:00.000Z",
};

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
    comments: [
      {
        id: "40000000-0000-4000-8000-000000000001",
        threadId: THREAD_ID,
        author: AUTHOR,
        body: "Hello",
        createdAt: "2026-10-21T10:00:00.000Z",
        editedAt: null,
        deleted: false,
        mentions: [],
      },
    ],
    ...overrides,
  };
}

function fakeBackend(threads: ThreadRecord[]) {
  const unused = vi.fn(() => Promise.resolve(failure("unknown")));
  const createThread = vi.fn<WidgetBackend["createThread"]>((input) =>
    Promise.resolve(
      success(
        thread({
          id: "30000000-0000-4000-8000-000000000002",
          anchor: input.anchor,
          context: CONTEXT,
          comments: [],
        }),
      ),
    ),
  );
  const backend: WidgetBackend = {
    getSiteInfo: vi.fn(() => Promise.resolve(success(SITE))),
    listThreads: vi.fn(() => Promise.resolve(success(threads))),
    createThread,
    setStatus: unused,
    createComment: unused,
    updateComment: unused,
    deleteComment: unused,
    listMembers: vi.fn(() => Promise.resolve(success([]))),
    subscribe: vi.fn<WidgetBackend["subscribe"]>((_subscription, handlers) => {
      handlers.onSubscribed();
      return { update: vi.fn(), close: vi.fn() };
    }),
    captureScreenshot: unused,
    getScreenshotUrl: unused,
    collectContext: vi.fn(() => Promise.resolve(CONTEXT)),
    getPreference: vi.fn(() => Promise.resolve(success({ showResolved: false }))),
    setPreference: vi.fn(() => Promise.resolve(success(null))),
    getClickUpStatus: vi.fn(() => Promise.resolve(success(false))),
    createClickUpTask: unused,
  };
  return { backend, createThread };
}

let handle: WidgetHandle | null = null;
let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML =
    '<main><button id="cta">Book a call</button><p id="copy">The quick brown fox.</p></main>';
  window.history.replaceState({}, "", "/");
  host = document.createElement("div");
  document.body.append(host);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => document.getElementById("cta"),
  });
  Object.defineProperty(document, "adoptedStyleSheets", {
    configurable: true,
    get: () => [],
    set: () => {
      throw new TypeError("blocked");
    },
  });
});

afterEach(() => {
  handle?.unmount();
  handle = null;
  Reflect.deleteProperty(document, "elementFromPoint");
  Reflect.deleteProperty(document, "adoptedStyleSheets");
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("mountWidget", () => {
  it("renders a pin for every thread the backend returns for the page", async () => {
    const { backend, createThread } = fakeBackend([thread()]);

    handle = mountWidget({ host, backend, document, window });

    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: "Comments, 1 open" })).toBeTruthy();
    });
    expect(backend.listThreads).toHaveBeenCalledWith(SITE.siteId, PAGE);
    expect(createThread).not.toHaveBeenCalled();
  });

  it("creates the thread through the backend when the new comment is submitted", async () => {
    const user = userEvent.setup();
    const { backend, createThread } = fakeBackend([]);
    handle = mountWidget({ host, backend, document, window });
    await vi.waitFor(() => {
      expect(backend.getSiteInfo).toHaveBeenCalled();
    });

    handle.setCommentMode(true);
    document
      .getElementById("cta")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    await user.type(await screen.findByRole("textbox", { name: "Comment" }), "Looks off");
    await user.click(screen.getByRole("button", { name: "Comment" }));

    await vi.waitFor(() => {
      expect(createThread).toHaveBeenCalledWith(
        expect.objectContaining({
          siteId: SITE.siteId,
          pageUrl: PAGE,
          body: "Looks off",
          mentions: [],
        }),
      );
    });
  });
});
