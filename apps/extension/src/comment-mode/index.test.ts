import { describe, expect, it, vi } from "vitest";

import { failure, success } from "../messages";
import { createToggleListener } from ".";

const EXTENSION_ID = "anefihllkbkenhjbjggfndgemgkfaeoa";
const TOGGLE = { type: "commentMode.toggle" };

describe("createToggleListener", () => {
  it("answers a toggle from the extension with the new state", () => {
    const toggle = vi.fn(() => success({ active: true }));
    const respond = vi.fn();

    createToggleListener({ extensionId: EXTENSION_ID, toggle })(
      TOGGLE,
      { id: EXTENSION_ID },
      respond,
    );

    expect(toggle).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledExactlyOnceWith(success({ active: true }));
  });

  it("passes a failure through", () => {
    const respond = vi.fn();

    createToggleListener({ extensionId: EXTENSION_ID, toggle: () => failure("unauthorized") })(
      TOGGLE,
      { id: EXTENSION_ID },
      respond,
    );

    expect(respond).toHaveBeenCalledExactlyOnceWith(failure("unauthorized"));
  });

  it.each([
    ["another extension", { id: "other" }],
    ["no sender id", {}],
    ["a content script or page tab", { id: EXTENSION_ID, tab: { id: 1 } }],
  ])("ignores a toggle from %s", (_name, sender) => {
    const toggle = vi.fn(() => success({ active: true }));
    const respond = vi.fn();

    createToggleListener({ extensionId: EXTENSION_ID, toggle })(TOGGLE, sender, respond);

    expect(toggle).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });

  it.each([
    ["another message", { type: "auth.stateChanged" }],
    ["a string", "commentMode.toggle"],
    ["undefined", undefined],
  ])("ignores %s", (_name, message) => {
    const toggle = vi.fn(() => success({ active: true }));
    const respond = vi.fn();

    createToggleListener({ extensionId: EXTENSION_ID, toggle })(
      message,
      { id: EXTENSION_ID },
      respond,
    );

    expect(toggle).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });
});
