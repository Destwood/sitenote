import { describe, expect, it, vi } from "vitest";

import { failure, success, type MessageResult, type PageThreadSummary } from "@sitenote/widget";
import { createToggleListener } from ".";
import type {
  CommentModeState,
  CommentOnElementState,
  PageOpenSidebarState,
  PageOpenThreadState,
} from "../messages";

const EXTENSION_ID = "anefihllkbkenhjbjggfndgemgkfaeoa";
const TOGGLE = { type: "commentMode.toggle" };
const COMMENT_ON_ELEMENT = { type: "commentMode.commentOnElement" };
const LIST_THREADS = { type: "page.listThreads" };
const OPEN_THREAD = { type: "page.openThread", threadId: "30000000-0000-4000-8000-000000000001" };
const OPEN_SIDEBAR = { type: "page.openSidebar" };

function listenerWith(
  toggle: () => MessageResult<CommentModeState> = () => success({ active: true }),
  commentOnElement: () => MessageResult<CommentOnElementState> = () => success({ started: true }),
  listThreads: () => MessageResult<PageThreadSummary[]> = () => success([]),
  openThread: (threadId: string) => MessageResult<PageOpenThreadState> = () =>
    success({ opened: true }),
  openSidebar: () => MessageResult<PageOpenSidebarState> = () => success({ opened: true }),
) {
  return createToggleListener({
    extensionId: EXTENSION_ID,
    toggle,
    commentOnElement,
    listThreads,
    openThread,
    openSidebar,
  });
}

describe("createToggleListener", () => {
  it("answers a toggle from the extension with the new state", () => {
    const toggle = vi.fn(() => success({ active: true }));
    const respond = vi.fn();

    listenerWith(toggle)(TOGGLE, { id: EXTENSION_ID }, respond);

    expect(toggle).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledExactlyOnceWith(success({ active: true }));
  });

  it("passes a failure through", () => {
    const respond = vi.fn();

    listenerWith(vi.fn(() => failure("unauthorized")))(TOGGLE, { id: EXTENSION_ID }, respond);

    expect(respond).toHaveBeenCalledExactlyOnceWith(failure("unauthorized"));
  });

  it("answers a comment on element request from the extension with its result", () => {
    const commentOnElement = vi.fn(() => success({ started: true }));
    const toggle = vi.fn(() => success({ active: true }));
    const respond = vi.fn();

    listenerWith(toggle, commentOnElement)(COMMENT_ON_ELEMENT, { id: EXTENSION_ID }, respond);

    expect(commentOnElement).toHaveBeenCalledTimes(1);
    expect(toggle).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledExactlyOnceWith(success({ started: true }));
  });

  it("passes a comment on element failure through", () => {
    const respond = vi.fn();

    listenerWith(
      undefined,
      vi.fn(() => failure("page_unavailable")),
    )(COMMENT_ON_ELEMENT, { id: EXTENSION_ID }, respond);

    expect(respond).toHaveBeenCalledExactlyOnceWith(failure("page_unavailable"));
  });

  it("answers a list threads request from the popup with the page's threads", () => {
    const threads: PageThreadSummary[] = [
      {
        id: "30000000-0000-4000-8000-000000000001",
        number: 1,
        status: "open",
        excerpt: "Hello",
        authorName: "Max",
        replies: 0,
        detached: false,
      },
    ];
    const listThreads = vi.fn(() => success(threads));
    const respond = vi.fn();

    listenerWith(undefined, undefined, listThreads)(LIST_THREADS, { id: EXTENSION_ID }, respond);

    expect(listThreads).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledExactlyOnceWith(success(threads));
  });

  it("answers an open thread request with the thread id and the result", () => {
    const openThread = vi.fn(() => success({ opened: false }));
    const respond = vi.fn();

    listenerWith(
      undefined,
      undefined,
      undefined,
      openThread,
    )(OPEN_THREAD, { id: EXTENSION_ID }, respond);

    expect(openThread).toHaveBeenCalledExactlyOnceWith(OPEN_THREAD.threadId);
    expect(respond).toHaveBeenCalledExactlyOnceWith(success({ opened: false }));
  });

  it("answers an open sidebar request from the popup with its result", () => {
    const openSidebar = vi.fn(() => success({ opened: true }));
    const toggle = vi.fn(() => success({ active: true }));
    const respond = vi.fn();

    listenerWith(
      toggle,
      undefined,
      undefined,
      undefined,
      openSidebar,
    )(OPEN_SIDEBAR, { id: EXTENSION_ID }, respond);

    expect(openSidebar).toHaveBeenCalledTimes(1);
    expect(toggle).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledExactlyOnceWith(success({ opened: true }));
  });

  it.each([
    ["another extension", { id: "other" }],
    ["no sender id", {}],
    ["a content script or page tab", { id: EXTENSION_ID, tab: { id: 1 } }],
  ])("ignores a toggle from %s", (_name, sender) => {
    const toggle = vi.fn(() => success({ active: true }));
    const commentOnElement = vi.fn(() => success({ started: true }));
    const openSidebar = vi.fn(() => success({ opened: true }));
    const respond = vi.fn();

    listenerWith(
      toggle,
      commentOnElement,
      undefined,
      undefined,
      openSidebar,
    )(TOGGLE, sender, respond);
    listenerWith(
      toggle,
      commentOnElement,
      undefined,
      undefined,
      openSidebar,
    )(COMMENT_ON_ELEMENT, sender, respond);
    listenerWith(
      toggle,
      commentOnElement,
      undefined,
      undefined,
      openSidebar,
    )(OPEN_SIDEBAR, sender, respond);

    expect(toggle).not.toHaveBeenCalled();
    expect(commentOnElement).not.toHaveBeenCalled();
    expect(openSidebar).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });

  it.each([
    ["another message", { type: "auth.stateChanged" }],
    ["a string", "commentMode.toggle"],
    ["undefined", undefined],
  ])("ignores %s", (_name, message) => {
    const toggle = vi.fn(() => success({ active: true }));
    const commentOnElement = vi.fn(() => success({ started: true }));
    const openSidebar = vi.fn(() => success({ opened: true }));
    const respond = vi.fn();

    listenerWith(
      toggle,
      commentOnElement,
      undefined,
      undefined,
      openSidebar,
    )(message, { id: EXTENSION_ID }, respond);

    expect(toggle).not.toHaveBeenCalled();
    expect(commentOnElement).not.toHaveBeenCalled();
    expect(openSidebar).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });
});
