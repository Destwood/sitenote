import { describe, expect, it } from "vitest";

import { ERROR_CODES, ERROR_MESSAGES, failure, isErrorCode, success } from ".";

describe("result", () => {
  it("wraps data in a success response", () => {
    expect(success({ id: 1 })).toEqual({ ok: true, data: { id: 1 } });
  });

  it("pairs every error code with its message", () => {
    for (const code of ERROR_CODES) {
      expect(failure(code)).toEqual({ ok: false, error: { code, message: ERROR_MESSAGES[code] } });
      expect(ERROR_MESSAGES[code]).not.toBe("");
    }
  });

  it("recognises only known error codes", () => {
    expect(isErrorCode("network")).toBe(true);
    expect(isErrorCode("made_up")).toBe(false);
  });
});
