import { describe, expect, it } from "vitest";

import { FAIL_NEXT_UPLOAD_MESSAGE, createTestHooks } from ".";

describe("createTestHooks", () => {
  it("fails exactly one upload after the message", () => {
    const hooks = createTestHooks();

    expect(hooks.consumeUploadFailure()).toBe(false);
    expect(hooks.handle({ type: FAIL_NEXT_UPLOAD_MESSAGE })).toBe(true);
    expect(hooks.consumeUploadFailure()).toBe(true);
    expect(hooks.consumeUploadFailure()).toBe(false);
  });

  it("ignores every other message", () => {
    const hooks = createTestHooks();

    for (const message of [{ type: "auth.getState" }, {}, null, "text", 7, undefined]) {
      expect(hooks.handle(message)).toBe(false);
    }
    expect(hooks.consumeUploadFailure()).toBe(false);
  });
});
