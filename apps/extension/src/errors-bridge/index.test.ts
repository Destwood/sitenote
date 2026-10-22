import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ERRORS_REQUEST_TYPE, ERRORS_RESPONSE_TYPE, MESSAGE_SOURCE } from "../console-errors";
import { ERRORS_TIMEOUT_MS, parseRecords, requestConsoleErrors } from ".";

const AT = "2026-10-22T09:30:00.000Z";
const NONCE = "nonce-1";
const GOOD = { kind: "error", message: "Boom", at: AT };

function fakeWindow() {
  const target = new EventTarget();
  const posted: { message: unknown; origin: string }[] = [];
  const win = Object.assign(target, {
    location: { origin: "https://example.test" },
    postMessage: (message: unknown, origin: string) => {
      posted.push({ message, origin });
    },
  });
  function deliver(init: { data: unknown; origin?: string; source?: unknown }) {
    const event = new MessageEvent("message", {
      data: init.data,
      origin: init.origin ?? "https://example.test",
    });
    Object.defineProperty(event, "source", { value: "source" in init ? init.source : win });
    win.dispatchEvent(event);
  }
  return { win: win as unknown as Window, posted, deliver };
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    source: MESSAGE_SOURCE,
    type: ERRORS_RESPONSE_TYPE,
    nonce: NONCE,
    records: [GOOD],
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("requestConsoleErrors", () => {
  it("posts the request with a nonce to its own origin and returns the validated records", async () => {
    const { win, posted, deliver } = fakeWindow();

    const pending = requestConsoleErrors({ win, newNonce: () => NONCE });
    deliver({ data: response() });

    expect(await pending).toEqual([GOOD]);
    expect(posted).toEqual([
      {
        message: { source: MESSAGE_SOURCE, type: ERRORS_REQUEST_TYPE, nonce: NONCE },
        origin: "https://example.test",
      },
    ]);
  });

  it("uses a fresh random nonce per request by default", () => {
    const { win, posted } = fakeWindow();

    void requestConsoleErrors({ win });
    void requestConsoleErrors({ win });

    const nonces = posted.map((entry) => (entry.message as { nonce: string }).nonce);
    expect(new Set(nonces).size).toBe(2);
    expect(nonces.every((nonce) => /^[0-9a-f-]{36}$/.test(nonce))).toBe(true);
  });

  it.each([
    ["another source window", { data: response(), source: {} }],
    ["a null source", { data: response(), source: null }],
    ["another origin", { data: response(), origin: "https://evil.test" }],
    ["a wrong nonce", { data: response({ nonce: "other" }) }],
    ["a missing nonce", { data: response({ nonce: undefined }) }],
    ["a wrong type", { data: response({ type: ERRORS_REQUEST_TYPE }) }],
    ["a wrong source tag", { data: response({ source: "page" }) }],
    ["a string payload", { data: "text" }],
    ["a null payload", { data: null }],
  ])("ignores a message with %s and times out empty", async (_name, init) => {
    const { win, deliver } = fakeWindow();

    const pending = requestConsoleErrors({ win, newNonce: () => NONCE });
    deliver(init);
    await vi.advanceTimersByTimeAsync(ERRORS_TIMEOUT_MS);

    expect(await pending).toEqual([]);
  });

  it("answers an empty list when the main world does not reply in time", async () => {
    const { win } = fakeWindow();
    let settled = false;

    const pending = requestConsoleErrors({ win, newNonce: () => NONCE, timeoutMs: 50 });
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(49);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual([]);
  });

  it("accepts only the first matching reply", async () => {
    const { win, deliver } = fakeWindow();

    const pending = requestConsoleErrors({ win, newNonce: () => NONCE });
    deliver({ data: response() });
    deliver({ data: response({ records: [{ ...GOOD, message: "forged" }] }) });

    expect(await pending).toEqual([GOOD]);
  });

  it("answers an empty list when posting is refused", async () => {
    const { win } = fakeWindow();
    Object.assign(win, {
      postMessage: () => {
        throw new SyntaxError("Invalid target origin");
      },
    });

    expect(await requestConsoleErrors({ win })).toEqual([]);
  });

  it("removes its listener after the reply", async () => {
    const { win, deliver } = fakeWindow();
    const remove = vi.spyOn(win, "removeEventListener");

    const pending = requestConsoleErrors({ win, newNonce: () => NONCE });
    deliver({ data: response() });
    await pending;

    expect(remove).toHaveBeenCalledWith("message", expect.any(Function));
  });
});

describe("parseRecords", () => {
  it("drops invalid records, keeps valid ones and ignores non-arrays", () => {
    expect(
      parseRecords([
        GOOD,
        { kind: "warn", message: "x", at: AT },
        "text",
        null,
        { ...GOOD, line: -1 },
      ]),
    ).toEqual([GOOD]);
    expect(parseRecords("nope")).toEqual([]);
    expect(parseRecords(undefined)).toEqual([]);
  });

  it("keeps at most the newest twenty records", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ ...GOOD, message: String(index) }));

    const records = parseRecords(many);

    expect(records).toHaveLength(20);
    expect(records[0]?.message).toBe("10");
    expect(records.at(-1)?.message).toBe("29");
  });

  it("drops records with over-long fields", () => {
    expect(parseRecords([{ ...GOOD, message: "x".repeat(1001) }])).toEqual([]);
  });
});
