import { describe, expect, it, vi } from "vitest";

import { TOGGLE_COMMENT_MODE_COMMAND } from "../manifest-config";
import { createCommandListener } from ".";

describe("createCommandListener", () => {
  it("toggles comment mode in the tab where the shortcut was pressed", () => {
    const toggle = vi.fn(() => Promise.resolve());

    createCommandListener(toggle)(TOGGLE_COMMENT_MODE_COMMAND, { id: 12 });

    expect(toggle).toHaveBeenCalledExactlyOnceWith(12);
  });

  it("ignores other commands and a missing tab", () => {
    const toggle = vi.fn(() => Promise.resolve());
    const listener = createCommandListener(toggle);

    listener("something-else", { id: 12 });
    listener(TOGGLE_COMMENT_MODE_COMMAND, undefined);
    listener(TOGGLE_COMMENT_MODE_COMMAND, {});

    expect(toggle).not.toHaveBeenCalled();
  });

  it("swallows a failure when the tab has no content script", async () => {
    const toggle = vi.fn(() => Promise.reject(new Error("Receiving end does not exist")));

    expect(() => {
      createCommandListener(toggle)(TOGGLE_COMMENT_MODE_COMMAND, { id: 1 });
    }).not.toThrow();
    await Promise.resolve();
  });
});
