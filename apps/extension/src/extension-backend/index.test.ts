import type { Anchor, ThreadContext } from "@sitenote/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PAGE_PORT_NAME } from "../messages";
import { createExtensionBackend } from ".";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("wxt/browser", () => ({
  browser: {
    runtime: {
      sendMessage: mocks.sendMessage,
      connect: mocks.connect,
    },
  },
}));

vi.mock("../errors-bridge", () => ({
  requestConsoleErrors: vi.fn(() => Promise.resolve([])),
}));

const SITE_ID = "20000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const COMMENT_ID = "40000000-0000-4000-8000-000000000001";
const PAGE = "https://example.test/pricing";
const ANCHOR: Anchor = {
  kind: "element",
  selectors: { id: "cta", css: "#cta", nthPath: "body > button:nth-of-type(1)" },
  fingerprint: { tag: "button", text: "Book", classes: [], width: 0, height: 0 },
  offset: { x: 0.5, y: 0.5 },
};
const CONTEXT: ThreadContext = {
  viewport: { width: 1440, height: 900 },
  devicePixelRatio: 2,
  pageTitle: "Pricing",
  url: PAGE,
  browser: { name: "Chrome", version: "130" },
  os: { name: "Windows", version: "11" },
  userAgent: "ua",
  consoleErrors: [],
  capturedAt: "2026-10-22T09:30:00.000Z",
};

const port = {
  postMessage: vi.fn(),
  disconnect: vi.fn(),
  onMessage: { addListener: vi.fn() },
  onDisconnect: { addListener: vi.fn() },
};

beforeEach(() => {
  mocks.sendMessage.mockReset();
  mocks.sendMessage.mockResolvedValue(undefined);
  mocks.connect.mockReset();
  mocks.connect.mockReturnValue(port);
});

describe("createExtensionBackend", () => {
  it.each([
    [
      "getSiteInfo",
      (backend: ReturnType<typeof createExtensionBackend>) =>
        backend.getSiteInfo("https://example.test"),
      { type: "sites.forOrigin", origin: "https://example.test" },
    ],
    [
      "listThreads",
      (backend: ReturnType<typeof createExtensionBackend>) => backend.listThreads(SITE_ID, PAGE),
      { type: "threads.list", siteId: SITE_ID, pageUrl: PAGE },
    ],
    [
      "createThread",
      (backend: ReturnType<typeof createExtensionBackend>) =>
        backend.createThread({
          siteId: SITE_ID,
          pageUrl: PAGE,
          anchor: ANCHOR,
          context: CONTEXT,
          body: "Hi",
          mentions: [],
        }),
      {
        type: "threads.create",
        siteId: SITE_ID,
        pageUrl: PAGE,
        anchor: ANCHOR,
        context: CONTEXT,
        body: "Hi",
        mentions: [],
      },
    ],
    [
      "setStatus",
      (backend: ReturnType<typeof createExtensionBackend>) =>
        backend.setStatus(THREAD_ID, "resolved"),
      { type: "threads.setStatus", threadId: THREAD_ID, status: "resolved" },
    ],
    [
      "createComment",
      (backend: ReturnType<typeof createExtensionBackend>) =>
        backend.createComment({ threadId: THREAD_ID, body: "Reply", mentions: [] }),
      { type: "comments.create", threadId: THREAD_ID, body: "Reply", mentions: [] },
    ],
    [
      "updateComment",
      (backend: ReturnType<typeof createExtensionBackend>) =>
        backend.updateComment({ commentId: COMMENT_ID, body: "Edited" }),
      { type: "comments.update", commentId: COMMENT_ID, body: "Edited" },
    ],
    [
      "deleteComment",
      (backend: ReturnType<typeof createExtensionBackend>) => backend.deleteComment(COMMENT_ID),
      { type: "comments.delete", commentId: COMMENT_ID },
    ],
    [
      "listMembers",
      (backend: ReturnType<typeof createExtensionBackend>) => backend.listMembers(WORKSPACE_ID),
      { type: "members.list", workspaceId: WORKSPACE_ID },
    ],
    [
      "captureScreenshot",
      (backend: ReturnType<typeof createExtensionBackend>) =>
        backend.captureScreenshot({ x: 1, y: 2, width: 3, height: 4 }, 2),
      {
        type: "screenshot.capture",
        rect: { x: 1, y: 2, width: 3, height: 4 },
        devicePixelRatio: 2,
      },
    ],
    [
      "getScreenshotUrl",
      (backend: ReturnType<typeof createExtensionBackend>) => backend.getScreenshotUrl(THREAD_ID),
      { type: "threads.screenshotUrl", threadId: THREAD_ID },
    ],
    [
      "getPreference",
      (backend: ReturnType<typeof createExtensionBackend>) => backend.getPreference(SITE_ID),
      { type: "preferences.get", siteId: SITE_ID },
    ],
    [
      "setPreference",
      (backend: ReturnType<typeof createExtensionBackend>) => backend.setPreference(SITE_ID, true),
      { type: "preferences.set", siteId: SITE_ID, showResolved: true },
    ],
    [
      "getClickUpStatus",
      (backend: ReturnType<typeof createExtensionBackend>) =>
        backend.getClickUpStatus(WORKSPACE_ID),
      { type: "clickup.status", workspaceId: WORKSPACE_ID },
    ],
    [
      "createClickUpTask",
      (backend: ReturnType<typeof createExtensionBackend>) => backend.createClickUpTask(THREAD_ID),
      { type: "clickup.createTask", threadId: THREAD_ID },
    ],
  ])("sends the runtime message behind %s", async (_name, call, message) => {
    await call(createExtensionBackend());

    expect(mocks.sendMessage).toHaveBeenCalledExactlyOnceWith(message);
  });

  it("opens the page port and subscribes with the site and page", () => {
    const backend = createExtensionBackend();

    const handle = backend.subscribe(
      { siteId: SITE_ID, workspaceId: WORKSPACE_ID, getPageUrl: () => PAGE },
      { onEvent: vi.fn(), onSubscribed: vi.fn(), onDisconnected: vi.fn() },
    );

    expect(mocks.connect).toHaveBeenCalledWith({ name: PAGE_PORT_NAME });
    expect(port.postMessage).toHaveBeenCalledWith({
      type: "page.subscribe",
      siteId: SITE_ID,
      workspaceId: WORKSPACE_ID,
      pageUrl: PAGE,
    });
    handle.close();
    expect(port.disconnect).toHaveBeenCalledOnce();
  });

  it("collects the thread context of the current page", async () => {
    const context = await createExtensionBackend().collectContext();

    expect(context.consoleErrors).toEqual([]);
    expect(context.capturedAt).not.toBe("");
  });
});
