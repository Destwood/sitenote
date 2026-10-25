import type { ThreadContext } from "@sitenote/core";
import { describe, expect, it, vi } from "vitest";

import type { AuthService } from "../auth-service";
import type { DataService } from "../data-service";
import type { NotificationCenter } from "../notification-center";
import type { ResolvedPreference } from "../resolved-preference";
import type { ScreenshotService } from "../screenshot-service";
import type { SelectionPlacementPreference } from "../selection-placement";
import { type AuthState } from "../messages";
import { failure, success } from "@sitenote/widget";
import type { SiteEnablement } from "../site-enablement";
import { createMessageRouter, senderOriginOf, type RouterSender } from ".";

const EXTENSION_ID = "anefihllkbkenhjbjggfndgemgkfaeoa";
const SIGNED_OUT: AuthState = { status: "signedOut" };
const SITE_ID = "20000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const COMMENT_ID = "40000000-0000-4000-8000-000000000001";
const NOTIFICATION_ID = "50000000-0000-4000-8000-000000000001";
const ORIGIN = "https://example.test";
const PAGE_URL = "https://example.test/pricing";
const ANCHOR = {
  kind: "text",
  quote: { exact: "Price", prefix: "", suffix: "" },
  position: { start: 0, end: 5 },
  container: "body",
};

const POPUP: RouterSender = {
  id: EXTENSION_ID,
  url: `chrome-extension://${EXTENSION_ID}/popup.html`,
};
const POPUP_TAB: RouterSender = { ...POPUP, tab: { id: 9 } };
const CONTENT: RouterSender = {
  id: EXTENSION_ID,
  url: `${PAGE_URL}?x=1`,
  tab: { id: 4, windowId: 2 },
};
const CAPTURE_ID = "60000000-0000-4000-8000-000000000001";
const CONTEXT: ThreadContext = {
  viewport: { width: 1440, height: 900 },
  devicePixelRatio: 2,
  pageTitle: "Pricing",
  url: PAGE_URL,
  browser: { name: "Chrome", version: "130" },
  os: { name: "Windows", version: "11" },
  userAgent: "ua",
  consoleErrors: [],
  capturedAt: "2026-10-22T09:30:00.000Z",
};
const RECT = { x: 10, y: 20, width: 100, height: 50 };

function createFakes() {
  const service: AuthService = {
    keepFresh: vi.fn(),
    describeSession: vi.fn(),
    getState: vi.fn(() => Promise.resolve(success(SIGNED_OUT))),
    sendCode: vi.fn(() => Promise.resolve(success(null))),
    verifyCode: vi.fn(() => Promise.resolve(success(SIGNED_OUT))),
    signInWithGoogle: vi.fn(() => Promise.resolve(failure("google_disabled"))),
    signOut: vi.fn(() => Promise.resolve(success(SIGNED_OUT))),
  };
  const data: DataService = {
    forOrigin: vi.fn(() => Promise.resolve(success(null))),
    listThreads: vi.fn(() => Promise.resolve(success([]))),
    createThread: vi.fn(),
    screenshotUrl: vi.fn(() => Promise.resolve(success(null))),
    setThreadStatus: vi.fn(),
    clickUpStatus: vi.fn(() => Promise.resolve(success(true))),
    clickUpCreateTask: vi.fn(),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    listWorkspaces: vi.fn(() => Promise.resolve(success([]))),
    listMembers: vi.fn(() => Promise.resolve(success([]))),
    listNotifications: vi.fn(),
    markNotificationsRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    countUnreadNotifications: vi.fn(),
    ensureSite: vi.fn(),
    findThreadPage: vi.fn(),
    hasSession: vi.fn(),
  };
  const enablement: SiteEnablement = {
    enable: vi.fn(() => Promise.resolve(success(null))),
    disable: vi.fn(() => Promise.resolve(success(null))),
    setErrorCapture: vi.fn(() => Promise.resolve(success(null))),
    reconcile: vi.fn(),
  };
  const screenshots: ScreenshotService = {
    capture: vi.fn(() =>
      Promise.resolve(success({ captureId: CAPTURE_ID, width: 10, height: 20 })),
    ),
  };
  const preferences = {
    load: vi.fn<ResolvedPreference["load"]>(() => Promise.resolve(true)),
    save: vi.fn<ResolvedPreference["save"]>(() => Promise.resolve()),
  };
  const selectionPlacement = {
    load: vi.fn<SelectionPlacementPreference["load"]>(() => Promise.resolve("below")),
    save: vi.fn<SelectionPlacementPreference["save"]>(() => Promise.resolve()),
  };
  const notifications: Pick<NotificationCenter, "list" | "markRead" | "markAllRead"> = {
    list: vi.fn(() => Promise.resolve(success({ items: [], unread: 0 }))),
    markRead: vi.fn(() => Promise.resolve(success(null))),
    markAllRead: vi.fn(() => Promise.resolve(success(null))),
  };
  return {
    service,
    data,
    enablement,
    notifications,
    screenshots,
    preferences,
    selectionPlacement,
  };
}

function setup(options: { enabled?: boolean; onWake?: () => Promise<void> } = {}) {
  const fakes = createFakes();
  const onWake = vi.fn(options.onWake ?? (() => Promise.resolve()));
  const getEnabledSite = vi.fn((origin: string) =>
    Promise.resolve(
      options.enabled === false || origin !== ORIGIN
        ? null
        : { siteId: SITE_ID, workspaceId: WORKSPACE_ID, captureErrors: true },
    ),
  );
  const route = createMessageRouter({
    extensionId: EXTENSION_ID,
    ...fakes,
    getEnabledSite,
    onWake,
  });
  return { route, onWake, getEnabledSite, ...fakes };
}

describe("senderOriginOf", () => {
  it("reads the origin of the sender url", () => {
    expect(senderOriginOf(CONTENT)).toBe(ORIGIN);
    expect(senderOriginOf({})).toBeNull();
    expect(senderOriginOf({ url: "not a url" })).toBeNull();
  });
});

describe("createMessageRouter sender checks", () => {
  it.each([
    ["a missing sender id", {}],
    ["another extension", { id: "pnmlpmcmdnkjhkdfmcnpbkalfmnkgnoj", url: POPUP.url }],
    ["the right id without a url or a tab", { id: EXTENSION_ID }],
  ])("rejects a message from %s before touching anything", async (_name, sender) => {
    const { route, onWake, service } = setup();

    const response = await route({ type: "auth.getState" }, sender);

    expect(response).toEqual(failure("forbidden_sender"));
    expect(onWake).not.toHaveBeenCalled();
    expect(service.getState).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown type", { type: "auth.deleteEverything" }],
    ["a missing email", { type: "auth.sendCode" }],
    ["a malformed code", { type: "auth.verifyCode", email: "a@b.test", code: "12" }],
    ["a broadcast sent as a request", { type: "auth.stateChanged", state: SIGNED_OUT }],
    ["a thread list without a page", { type: "threads.list", siteId: SITE_ID }],
    [
      "an empty comment",
      { type: "comments.create", threadId: THREAD_ID, body: "  ", mentions: [] },
    ],
    ["a string", "auth.getState"],
    ["undefined", undefined],
  ])("rejects %s as an invalid request", async (_name, message) => {
    const { route, onWake } = setup();

    expect(await route(message, POPUP)).toEqual(failure("invalid_request"));
    expect(onWake).not.toHaveBeenCalled();
  });
});

describe("createMessageRouter extension page requests", () => {
  it("routes auth and admin requests to their handlers from an extension page", async () => {
    const { route, service, data, enablement, notifications } = setup();

    await route({ type: "auth.getState" }, POPUP);
    await route({ type: "auth.sendCode", email: " a@b.test " }, POPUP);
    await route({ type: "auth.verifyCode", email: "a@b.test", code: "123456" }, POPUP);
    await route({ type: "auth.signInWithGoogle" }, POPUP);
    await route({ type: "auth.signOut" }, POPUP);
    await route({ type: "workspaces.list" }, POPUP);
    await route({ type: "notifications.list", limit: 30 }, POPUP);
    await route({ type: "notifications.markRead", ids: [NOTIFICATION_ID] }, POPUP);
    await route({ type: "notifications.markAllRead" }, POPUP);
    await route(
      { type: "sites.enable", tabId: 3, origin: ORIGIN, workspaceId: WORKSPACE_ID },
      POPUP,
    );
    await route({ type: "sites.disable", origin: ORIGIN }, POPUP);

    expect(service.getState).toHaveBeenCalledTimes(1);
    expect(service.sendCode).toHaveBeenCalledWith("a@b.test");
    expect(service.verifyCode).toHaveBeenCalledWith("a@b.test", "123456");
    expect(service.signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(service.signOut).toHaveBeenCalledTimes(1);
    expect(data.listWorkspaces).toHaveBeenCalledTimes(1);
    expect(notifications.list).toHaveBeenCalledExactlyOnceWith(30);
    expect(notifications.markRead).toHaveBeenCalledExactlyOnceWith([NOTIFICATION_ID]);
    expect(notifications.markAllRead).toHaveBeenCalledTimes(1);
    expect(enablement.enable).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 3, origin: ORIGIN, workspaceId: WORKSPACE_ID }),
    );
    expect(enablement.disable).toHaveBeenCalledWith(ORIGIN);
  });

  it("answers sites.forOrigin for any origin", async () => {
    const { route, data } = setup();

    await route({ type: "sites.forOrigin", origin: "https://other.test" }, POPUP);

    expect(data.forOrigin).toHaveBeenCalledWith({
      type: "sites.forOrigin",
      origin: "https://other.test",
    });
  });

  it("returns the handler response unchanged", async () => {
    const { route } = setup();

    expect(await route({ type: "auth.signInWithGoogle" }, POPUP)).toEqual(
      failure("google_disabled"),
    );
    expect(await route({ type: "auth.sendCode", email: "a@b.test" }, POPUP)).toEqual(success(null));
  });

  it("makes sure the session is current before handling a valid message", async () => {
    const order: string[] = [];
    const { route, service } = setup({
      onWake: () => {
        order.push("wake");
        return Promise.resolve();
      },
    });
    vi.mocked(service.getState).mockImplementation(() => {
      order.push("handler");
      return Promise.resolve(success(SIGNED_OUT));
    });

    await route({ type: "auth.getState" }, POPUP);

    expect(order).toEqual(["wake", "handler"]);
  });

  it("still handles the message when the wake-up refresh fails", async () => {
    const { route, service } = setup({ onWake: () => Promise.reject(new Error("offline")) });

    expect(await route({ type: "auth.getState" }, POPUP)).toEqual(success(SIGNED_OUT));
    expect(service.getState).toHaveBeenCalledTimes(1);
  });
});

describe("createMessageRouter screenshots", () => {
  const CAPTURE = { type: "screenshot.capture", rect: RECT, devicePixelRatio: 2 };

  it("captures for a content script of an enabled origin with its tab, window and origin", async () => {
    const { route, screenshots } = setup();

    expect(await route(CAPTURE, CONTENT)).toEqual(
      success({ captureId: CAPTURE_ID, width: 10, height: 20 }),
    );

    expect(screenshots.capture).toHaveBeenCalledExactlyOnceWith(
      { tabId: 4, windowId: 2, origin: ORIGIN },
      { rect: RECT, devicePixelRatio: 2 },
    );
  });

  it("refuses a capture from an origin that is not enabled, from a popup and without a window", async () => {
    const disabled = setup({ enabled: false });
    expect(await disabled.route(CAPTURE, CONTENT)).toEqual(failure("forbidden"));

    const { route, screenshots } = setup();
    expect(await route(CAPTURE, POPUP)).toEqual(failure("forbidden_sender"));
    expect(await route(CAPTURE, { id: EXTENSION_ID, url: PAGE_URL, tab: { id: 4 } })).toEqual(
      failure("forbidden_sender"),
    );
    expect(screenshots.capture).not.toHaveBeenCalled();
    expect(disabled.screenshots.capture).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing rect", { type: "screenshot.capture", devicePixelRatio: 2 }],
    ["a negative size", { ...CAPTURE, rect: { ...RECT, width: -1 } }],
    ["a non-finite position", { ...CAPTURE, rect: { ...RECT, x: Number.POSITIVE_INFINITY } }],
    ["a zero ratio", { ...CAPTURE, devicePixelRatio: 0 }],
    ["a huge ratio", { ...CAPTURE, devicePixelRatio: 100 }],
  ])("rejects %s", async (_name, message) => {
    const { route, screenshots } = setup();

    expect(await route(message, CONTENT)).toEqual(failure("invalid_request"));
    expect(screenshots.capture).not.toHaveBeenCalled();
  });

  it("serves the signed url of a thread to a content script only", async () => {
    const { route, data } = setup();
    const request = { type: "threads.screenshotUrl", threadId: THREAD_ID };

    await route(request, CONTENT);
    expect(await route(request, POPUP)).toEqual(failure("forbidden_sender"));

    expect(data.screenshotUrl).toHaveBeenCalledExactlyOnceWith(request);
  });
});

describe("createMessageRouter preferences", () => {
  it("reads and writes the choice of the enabled site for a content script", async () => {
    const { route, preferences } = setup();

    expect(await route({ type: "preferences.get", siteId: SITE_ID }, CONTENT)).toEqual(
      success({ showResolved: true }),
    );
    expect(
      await route({ type: "preferences.set", siteId: SITE_ID, showResolved: false }, CONTENT),
    ).toEqual(success(null));

    expect(preferences.load).toHaveBeenCalledWith(SITE_ID);
    expect(preferences.save).toHaveBeenCalledWith(SITE_ID, false);
  });

  it("refuses the choice of another site, of a disabled origin and from a popup", async () => {
    const other = "20000000-0000-4000-8000-0000000000ff";
    const { route, preferences } = setup();
    expect(await route({ type: "preferences.get", siteId: other }, CONTENT)).toEqual(
      failure("forbidden"),
    );
    expect(
      await route({ type: "preferences.set", siteId: other, showResolved: true }, CONTENT),
    ).toEqual(failure("forbidden"));
    expect(await route({ type: "preferences.get", siteId: SITE_ID }, POPUP)).toEqual(
      failure("forbidden_sender"),
    );
    const disabled = setup({ enabled: false });
    expect(await disabled.route({ type: "preferences.get", siteId: SITE_ID }, CONTENT)).toEqual(
      failure("forbidden"),
    );
    expect(preferences.load).not.toHaveBeenCalled();
    expect(preferences.save).not.toHaveBeenCalled();
  });

  it("answers unknown when the choice cannot be stored", async () => {
    const { route, preferences } = setup();
    preferences.save.mockRejectedValueOnce(new Error("quota"));

    expect(
      await route({ type: "preferences.set", siteId: SITE_ID, showResolved: true }, CONTENT),
    ).toEqual(failure("unknown"));
  });
});

describe("createMessageRouter selection placement", () => {
  it("lets a content script read the placement without an enabled site", async () => {
    const { route, selectionPlacement } = setup({ enabled: false });
    selectionPlacement.load.mockResolvedValueOnce("above");

    expect(await route({ type: "preferences.getSelectionPlacement" }, CONTENT)).toEqual(
      success("above"),
    );
    expect(selectionPlacement.load).toHaveBeenCalledTimes(1);
  });

  it("lets a popup change the placement", async () => {
    const { route, selectionPlacement } = setup();

    expect(
      await route({ type: "preferences.setSelectionPlacement", placement: "above" }, POPUP),
    ).toEqual(success(null));
    expect(selectionPlacement.save).toHaveBeenCalledExactlyOnceWith("above");
  });

  it("refuses to change the placement from a content script", async () => {
    const { route, selectionPlacement } = setup();

    expect(
      await route({ type: "preferences.setSelectionPlacement", placement: "above" }, CONTENT),
    ).toEqual(failure("forbidden_sender"));
    expect(selectionPlacement.save).not.toHaveBeenCalled();
  });

  it("answers unknown when the placement cannot be stored", async () => {
    const { route, selectionPlacement } = setup();
    selectionPlacement.save.mockRejectedValueOnce(new Error("quota"));

    expect(
      await route({ type: "preferences.setSelectionPlacement", placement: "below" }, POPUP),
    ).toEqual(failure("unknown"));
  });
});

describe("createMessageRouter error capture and test messages", () => {
  it("lets a popup switch error capture for an origin", async () => {
    const { route, enablement } = setup();
    const message = { type: "sites.setErrorCapture", tabId: 7, origin: ORIGIN, enabled: false };

    expect(await route(message, POPUP)).toEqual(success(null));

    expect(enablement.setErrorCapture).toHaveBeenCalledExactlyOnceWith(message);
  });

  it("hands test messages from an extension page to the test hook only", async () => {
    const handleTestMessage = vi.fn((message: unknown) =>
      typeof message === "object" && message !== null && "type" in message
        ? message.type === "__test.failNextUpload"
        : false,
    );
    const fakes = createFakes();
    const route = createMessageRouter({
      extensionId: EXTENSION_ID,
      ...fakes,
      getEnabledSite: () => Promise.resolve(null),
      onWake: () => Promise.resolve(),
      handleTestMessage,
    });

    expect(await route({ type: "__test.failNextUpload" }, POPUP)).toEqual(success(null));
    expect(await route({ type: "__test.failNextUpload" }, CONTENT)).toEqual(
      failure("invalid_request"),
    );
    expect(await route({ type: "__test.other" }, POPUP)).toEqual(failure("invalid_request"));
    expect(handleTestMessage).toHaveBeenCalledTimes(2);
  });

  it("ignores test messages when no hook is installed", async () => {
    const { route } = setup();

    expect(await route({ type: "__test.failNextUpload" }, POPUP)).toEqual(
      failure("invalid_request"),
    );
  });
});

describe("createMessageRouter ClickUp requests", () => {
  it("routes the ClickUp status and task requests from an enabled page to the data service", async () => {
    const { route, data } = setup();

    expect(await route({ type: "clickup.status", workspaceId: WORKSPACE_ID }, CONTENT)).toEqual(
      success(true),
    );
    expect(data.clickUpStatus).toHaveBeenCalledExactlyOnceWith({
      type: "clickup.status",
      workspaceId: WORKSPACE_ID,
    });
    await route({ type: "clickup.createTask", threadId: THREAD_ID }, CONTENT);
    expect(data.clickUpCreateTask).toHaveBeenCalledExactlyOnceWith({
      type: "clickup.createTask",
      threadId: THREAD_ID,
    });
  });
});

describe("createMessageRouter content script requests", () => {
  const LIST = { type: "threads.list", siteId: SITE_ID, pageUrl: PAGE_URL };

  it.each([
    ["auth.getState", { type: "auth.getState" }],
    ["auth.signOut", { type: "auth.signOut" }],
    ["workspaces.list", { type: "workspaces.list" }],
    ["notifications.list", { type: "notifications.list", limit: 10 }],
    ["notifications.markRead", { type: "notifications.markRead", ids: [NOTIFICATION_ID] }],
    ["notifications.markAllRead", { type: "notifications.markAllRead" }],
    ["sites.enable", { type: "sites.enable", tabId: 4, origin: ORIGIN, workspaceId: WORKSPACE_ID }],
    ["sites.disable", { type: "sites.disable", origin: ORIGIN }],
    [
      "sites.setErrorCapture",
      { type: "sites.setErrorCapture", tabId: 4, origin: ORIGIN, enabled: false },
    ],
  ])("refuses %s from a content script", async (_name, message) => {
    const { route, service, data, enablement, notifications } = setup();

    expect(await route(message, CONTENT)).toEqual(failure("forbidden_sender"));
    expect(service.getState).not.toHaveBeenCalled();
    expect(service.signOut).not.toHaveBeenCalled();
    expect(data.listWorkspaces).not.toHaveBeenCalled();
    expect(notifications.list).not.toHaveBeenCalled();
    expect(notifications.markRead).not.toHaveBeenCalled();
    expect(notifications.markAllRead).not.toHaveBeenCalled();
    expect(enablement.enable).not.toHaveBeenCalled();
    expect(enablement.disable).not.toHaveBeenCalled();
    expect(enablement.setErrorCapture).not.toHaveBeenCalled();
  });

  it("serves the members of the enabled workspace only", async () => {
    const { route, data } = setup();

    await route({ type: "members.list", workspaceId: WORKSPACE_ID }, CONTENT);
    expect(data.listMembers).toHaveBeenCalledExactlyOnceWith({
      type: "members.list",
      workspaceId: WORKSPACE_ID,
    });

    expect(
      await route(
        { type: "members.list", workspaceId: "10000000-0000-4000-8000-000000000009" },
        CONTENT,
      ),
    ).toEqual(failure("forbidden"));
    expect(data.listMembers).toHaveBeenCalledTimes(1);
  });

  it("refuses the member list from a page whose origin is not enabled and from a popup", async () => {
    const disabled = setup({ enabled: false });
    expect(
      await disabled.route({ type: "members.list", workspaceId: WORKSPACE_ID }, CONTENT),
    ).toEqual(failure("forbidden"));

    const { route, data } = setup();
    expect(await route({ type: "members.list", workspaceId: WORKSPACE_ID }, POPUP)).toEqual(
      failure("forbidden_sender"),
    );
    expect(disabled.data.listMembers).not.toHaveBeenCalled();
    expect(data.listMembers).not.toHaveBeenCalled();
  });

  it("lets a content script ask about its own origin only", async () => {
    const { route, data } = setup();

    await route({ type: "sites.forOrigin", origin: ORIGIN }, CONTENT);
    expect(data.forOrigin).toHaveBeenCalledTimes(1);

    expect(await route({ type: "sites.forOrigin", origin: "https://other.test" }, CONTENT)).toEqual(
      failure("forbidden"),
    );
    expect(data.forOrigin).toHaveBeenCalledTimes(1);
  });

  it("serves page requests for the enabled site of the sender", async () => {
    const { route, data } = setup();

    await route(LIST, CONTENT);
    await route(
      {
        type: "threads.create",
        siteId: SITE_ID,
        pageUrl: PAGE_URL,
        anchor: ANCHOR,
        context: CONTEXT,
        captureId: CAPTURE_ID,
        body: "  Looks wrong ",
        mentions: [],
      },
      CONTENT,
    );
    await route({ type: "threads.setStatus", threadId: THREAD_ID, status: "resolved" }, CONTENT);
    await route(
      { type: "comments.create", threadId: THREAD_ID, body: "Reply", mentions: [] },
      CONTENT,
    );
    await route({ type: "comments.update", commentId: COMMENT_ID, body: "Edited" }, CONTENT);
    await route({ type: "comments.delete", commentId: COMMENT_ID }, CONTENT);

    expect(data.listThreads).toHaveBeenCalledWith(LIST);
    expect(data.createThread).toHaveBeenCalledWith(
      expect.objectContaining({ body: "Looks wrong", siteId: SITE_ID, captureId: CAPTURE_ID }),
    );
    expect(data.setThreadStatus).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: THREAD_ID, status: "resolved" }),
    );
    expect(data.createComment).toHaveBeenCalledTimes(1);
    expect(data.updateComment).toHaveBeenCalledTimes(1);
    expect(data.deleteComment).toHaveBeenCalledTimes(1);
  });

  it("refuses page requests from a page whose origin is not enabled", async () => {
    const { route, data } = setup({ enabled: false });

    expect(await route(LIST, CONTENT)).toEqual(failure("forbidden"));
    expect(await route({ type: "comments.delete", commentId: COMMENT_ID }, CONTENT)).toEqual(
      failure("forbidden"),
    );
    expect(data.listThreads).not.toHaveBeenCalled();
    expect(data.deleteComment).not.toHaveBeenCalled();
  });

  it("refuses a thread request for another site or another origin", async () => {
    const { route, data } = setup();

    expect(
      await route({ ...LIST, siteId: "20000000-0000-4000-8000-000000000009" }, CONTENT),
    ).toEqual(failure("forbidden"));
    expect(await route({ ...LIST, pageUrl: "https://evil.test/pricing" }, CONTENT)).toEqual(
      failure("forbidden"),
    );
    expect(data.listThreads).not.toHaveBeenCalled();
  });

  it("refuses page requests from an extension page without a tab", async () => {
    const { route, data } = setup();

    expect(await route(LIST, POPUP)).toEqual(failure("forbidden_sender"));
    expect(data.listThreads).not.toHaveBeenCalled();
  });

  it("refuses page requests from an extension page in a tab because its origin is not a site", async () => {
    const { route, data } = setup();

    expect(await route(LIST, POPUP_TAB)).toEqual(failure("forbidden"));
    expect(data.listThreads).not.toHaveBeenCalled();
  });
});
