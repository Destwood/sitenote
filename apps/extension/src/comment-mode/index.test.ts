import { describe, expect, it, vi } from "vitest";

import { failure, success, type MessageResult } from "@sitenote/widget";
import { createToggleListener } from ".";
import type { CommentModeState, CommentOnElementState } from "../messages";

const EXTENSION_ID = "anefihllkbkenhjbjggfndgemgkfaeoa";
const TOGGLE = { type: "commentMode.toggle" };
const COMMENT_ON_ELEMENT = { type: "commentMode.commentOnElement" };

function listenerWith(
  toggle: () => MessageResult<CommentModeState> = () => success({ active: true }),
  commentOnElement: () => MessageResult<CommentOnElementState> = () => success({ started: true }),
) {
  return createToggleListener({ extensionId: EXTENSION_ID, toggle, commentOnElement });
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

  it.each([
    ["another extension", { id: "other" }],
    ["no sender id", {}],
    ["a content script or page tab", { id: EXTENSION_ID, tab: { id: 1 } }],
  ])("ignores a toggle from %s", (_name, sender) => {
    const toggle = vi.fn(() => success({ active: true }));
    const commentOnElement = vi.fn(() => success({ started: true }));
    const respond = vi.fn();

    listenerWith(toggle, commentOnElement)(TOGGLE, sender, respond);
    listenerWith(toggle, commentOnElement)(COMMENT_ON_ELEMENT, sender, respond);

    expect(toggle).not.toHaveBeenCalled();
    expect(commentOnElement).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });

  it.each([
    ["another message", { type: "auth.stateChanged" }],
    ["a string", "commentMode.toggle"],
    ["undefined", undefined],
  ])("ignores %s", (_name, message) => {
    const toggle = vi.fn(() => success({ active: true }));
    const commentOnElement = vi.fn(() => success({ started: true }));
    const respond = vi.fn();

    listenerWith(toggle, commentOnElement)(message, { id: EXTENSION_ID }, respond);

    expect(toggle).not.toHaveBeenCalled();
    expect(commentOnElement).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });
});
