import { describe, expect, it, vi } from "vitest";

import type { AuthService } from "../auth-service";
import type { DataService } from "../data-service";
import { failure, success, type AuthState } from "../messages";
import type { SiteEnablement } from "../site-enablement";
import { createMessageRouter, senderOriginOf, type RouterSender } from ".";

const EXTENSION_ID = "anefihllkbkenhjbjggfndgemgkfaeoa";
const SIGNED_OUT: AuthState = { status: "signedOut" };
const SITE_ID = "20000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const COMMENT_ID = "40000000-0000-4000-8000-000000000001";
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
const CONTENT: RouterSender = { id: EXTENSION_ID, url: `${PAGE_URL}?x=1`, tab: { id: 4 } };

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
    setThreadStatus: vi.fn(),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    listWorkspaces: vi.fn(() => Promise.resolve(success([]))),
    ensureSite: vi.fn(),
    findThreadPage: vi.fn(),
    hasSession: vi.fn(),
  };
  const enablement: SiteEnablement = {
    enable: vi.fn(() => Promise.resolve(success(null))),
    disable: vi.fn(() => Promise.resolve(success(null))),
    reconcile: vi.fn(),
  };
  return { service, data, enablement };
}

function setup(options: { enabled?: boolean; onWake?: () => Promise<void> } = {}) {
  const fakes = createFakes();
  const onWake = vi.fn(options.onWake ?? (() => Promise.resolve()));
  const getEnabledSite = vi.fn((origin: string) =>
    Promise.resolve(
      options.enabled === false || origin !== ORIGIN
        ? null
        : { siteId: SITE_ID, workspaceId: WORKSPACE_ID },
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
    const { route, service, data, enablement } = setup();

    await route({ type: "auth.getState" }, POPUP);
    await route({ type: "auth.sendCode", email: " a@b.test " }, POPUP);
    await route({ type: "auth.verifyCode", email: "a@b.test", code: "123456" }, POPUP);
    await route({ type: "auth.signInWithGoogle" }, POPUP);
    await route({ type: "auth.signOut" }, POPUP);
    await route({ type: "workspaces.list" }, POPUP);
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

describe("createMessageRouter content script requests", () => {
  const LIST = { type: "threads.list", siteId: SITE_ID, pageUrl: PAGE_URL };

  it.each([
    ["auth.getState", { type: "auth.getState" }],
    ["auth.signOut", { type: "auth.signOut" }],
    ["workspaces.list", { type: "workspaces.list" }],
    ["sites.enable", { type: "sites.enable", tabId: 4, origin: ORIGIN, workspaceId: WORKSPACE_ID }],
    ["sites.disable", { type: "sites.disable", origin: ORIGIN }],
  ])("refuses %s from a content script", async (_name, message) => {
    const { route, service, data, enablement } = setup();

    expect(await route(message, CONTENT)).toEqual(failure("forbidden_sender"));
    expect(service.getState).not.toHaveBeenCalled();
    expect(service.signOut).not.toHaveBeenCalled();
    expect(data.listWorkspaces).not.toHaveBeenCalled();
    expect(enablement.enable).not.toHaveBeenCalled();
    expect(enablement.disable).not.toHaveBeenCalled();
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
        context: { width: 1 },
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
      expect.objectContaining({ body: "Looks wrong", siteId: SITE_ID }),
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
