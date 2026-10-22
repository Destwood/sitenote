import {
  CONSOLE_ERRORS_MAX,
  CONSOLE_MESSAGE_MAX,
  CONSOLE_SOURCE_MAX,
  CONSOLE_STACK_MAX,
} from "@sitenote/core";
import { describe, expect, it, vi } from "vitest";

import {
  BUFFER_SIZE,
  ERRORS_REQUEST_TYPE,
  ERRORS_RESPONSE_TYPE,
  MESSAGE_MAX,
  MESSAGE_SOURCE,
  NONCE_MAX,
  SOURCE_MAX,
  STACK_MAX,
  createErrorBuffer,
  formatArguments,
  installErrorCapture,
  type CaptureTarget,
} from ".";

const NOW = new Date("2026-10-22T09:30:00.000Z");

function setup() {
  const original = vi.fn();
  const posted: { message: unknown; origin: string }[] = [];
  const target = new EventTarget();
  const win = Object.assign(target, {
    location: { origin: "https://example.test" },
    console: { error: original },
    postMessage: (message: unknown, origin: string) => {
      posted.push({ message, origin });
    },
  }) as unknown as CaptureTarget;
  const buffer = createErrorBuffer(() => NOW);
  installErrorCapture(win, buffer);
  function request(data: unknown, init: { origin?: string; source?: unknown } = {}) {
    const event = new MessageEvent("message", {
      data,
      origin: init.origin ?? "https://example.test",
    });
    Object.defineProperty(event, "source", { value: "source" in init ? init.source : win });
    win.dispatchEvent(event);
  }
  return { win, buffer, original, posted, request };
}

describe("limits", () => {
  it("match the schema limits of the core package", () => {
    expect(BUFFER_SIZE).toBe(CONSOLE_ERRORS_MAX);
    expect(MESSAGE_MAX).toBe(CONSOLE_MESSAGE_MAX);
    expect(SOURCE_MAX).toBe(CONSOLE_SOURCE_MAX);
    expect(STACK_MAX).toBe(CONSOLE_STACK_MAX);
  });
});

describe("createErrorBuffer", () => {
  it("keeps the newest twenty records in order", () => {
    const buffer = createErrorBuffer(() => NOW);

    for (let index = 0; index < 25; index += 1) {
      buffer.push({ kind: "error", message: String(index) });
    }

    const records = buffer.snapshot();
    expect(records).toHaveLength(20);
    expect(records[0]?.message).toBe("5");
    expect(records.at(-1)?.message).toBe("24");
  });

  it("truncates every field and drops empty or invalid optional fields", () => {
    const buffer = createErrorBuffer(() => NOW);

    buffer.push({
      kind: "error",
      message: "m".repeat(MESSAGE_MAX + 10),
      source: "s".repeat(SOURCE_MAX + 10),
      line: 3,
      column: 1.5,
      stack: "k".repeat(STACK_MAX + 10),
    });
    buffer.push({ kind: "error", message: "x", source: "", line: -1, stack: "" });

    const [first, second] = buffer.snapshot();
    expect(first?.message).toHaveLength(MESSAGE_MAX);
    expect(first?.source).toHaveLength(SOURCE_MAX);
    expect(first?.stack).toHaveLength(STACK_MAX);
    expect(first?.line).toBe(3);
    expect(first?.column).toBeUndefined();
    expect(second).toEqual({ kind: "error", message: "x", at: NOW.toISOString() });
  });

  it("returns copies that cannot change the buffer", () => {
    const buffer = createErrorBuffer(() => NOW);
    buffer.push({ kind: "error", message: "a" });

    const first = buffer.snapshot();
    const [record] = first;
    if (record !== undefined) {
      record.message = "changed";
    }

    expect(buffer.snapshot()[0]?.message).toBe("a");
  });
});

describe("formatArguments", () => {
  it("joins primitives, errors and functions", () => {
    expect(
      formatArguments([
        "a",
        1,
        true,
        undefined,
        null,
        10n,
        Symbol("s"),
        new TypeError("bad"),
        function named() {
          return 1;
        },
      ]),
    ).toBe("a 1 true undefined null 10 Symbol(s) TypeError: bad [Function named]");
  });

  it("describes objects, arrays, nodes and circular references within a depth cap", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    const element = document.createElement("div");

    expect(formatArguments([{ a: 1, b: [1, 2] }])).toBe("{a: 1, b: [1, 2]}");
    expect(formatArguments([circular])).toBe("{name: loop, self: [Circular]}");
    expect(formatArguments([element])).toBe("<div>");
    expect(formatArguments([{ a: { b: { c: { d: 1 } } } }])).toBe("{a: {b: {c: [Object]}}}");
    expect(formatArguments([[[[[1]]]]])).toBe("[[[[Array(1)]]]]");
  });

  it("caps the number of items and the total length", () => {
    expect(formatArguments([Array.from({ length: 12 }, (_, index) => index)])).toBe(
      "[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, …]",
    );
    expect(formatArguments(["x".repeat(5000), "y"]).length).toBeLessThanOrEqual(1501);
  });

  it("never throws for hostile values", () => {
    const throwing = {
      get boom(): never {
        throw new Error("getter");
      },
    };
    const proxy = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error("trap");
        },
      },
    );

    expect(() => formatArguments([throwing, proxy])).not.toThrow();
    expect(formatArguments([proxy])).toBe("[Unserializable]");
  });
});

describe("installErrorCapture", () => {
  it("records uncaught errors with source, position and stack", () => {
    const { win, buffer } = setup();
    const error = new Error("kaput");

    win.dispatchEvent(
      new ErrorEvent("error", {
        message: "Uncaught Error: kaput",
        filename: "https://example.test/app.js",
        lineno: 12,
        colno: 4,
        error,
      }),
    );

    expect(buffer.snapshot()).toEqual([
      {
        kind: "error",
        message: "Uncaught Error: kaput",
        source: "https://example.test/app.js",
        line: 12,
        column: 4,
        stack: error.stack,
        at: NOW.toISOString(),
      },
    ]);
  });

  it("ignores error events that are not ErrorEvents, such as resource failures", () => {
    const { win, buffer } = setup();

    win.dispatchEvent(new Event("error"));

    expect(buffer.snapshot()).toEqual([]);
  });

  it("records unhandled rejections for errors and for other reasons", () => {
    const { win, buffer } = setup();

    win.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), { reason: new Error("nope") }),
    );
    win.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "plain" }));

    const [first, second] = buffer.snapshot();
    expect(first).toMatchObject({
      kind: "unhandledrejection",
      message: "Uncaught (in promise) Error: nope",
    });
    expect(first?.stack).toContain("nope");
    expect(second).toMatchObject({ message: "Uncaught (in promise) plain" });
  });

  it("wraps console.error, records the call and still calls the original with the same arguments", () => {
    const { win, buffer, original } = setup();
    const wrapper = win.console.error;

    wrapper("clicked", { id: 7 });

    expect(wrapper).not.toBe(original);
    expect(original).toHaveBeenCalledExactlyOnceWith("clicked", { id: 7 });
    expect(buffer.snapshot()).toEqual([
      { kind: "console.error", message: "clicked {id: 7}", at: NOW.toISOString() },
    ]);
  });

  it("keeps the call receiver and propagates what the original throws", () => {
    const { win, original } = setup();
    original.mockImplementation(() => {
      throw new Error("original failed");
    });

    expect(() => {
      win.console.error("x");
    }).toThrow("original failed");
  });

  it("includes the stack of an Error argument", () => {
    const { win, buffer } = setup();
    const error = new RangeError("range");

    win.console.error("failed:", error);

    expect(buffer.snapshot()[0]).toMatchObject({
      message: "failed: RangeError: range",
      stack: error.stack,
    });
  });

  it("does not wrap twice when installed again", () => {
    const { win, buffer } = setup();
    const wrapper = win.console.error;

    installErrorCapture(win, createErrorBuffer());

    expect(win.console.error).toBe(wrapper);
    win.console.error("once");
    expect(buffer.snapshot()).toHaveLength(1);
  });

  it("survives a console that cannot be replaced", () => {
    const original = vi.fn();
    const frozen = Object.freeze({ error: original });
    const win = Object.assign(new EventTarget(), {
      location: { origin: "https://example.test" },
      console: frozen,
      postMessage: vi.fn(),
    }) as unknown as CaptureTarget;

    expect(() => {
      installErrorCapture(win, createErrorBuffer());
    }).not.toThrow();
  });
});

describe("the request channel", () => {
  it("answers a matching request to its own origin with the records and the nonce", () => {
    const { buffer, posted, request } = setup();
    buffer.push({ kind: "error", message: "one" });

    request({ source: MESSAGE_SOURCE, type: ERRORS_REQUEST_TYPE, nonce: "n-1" });

    expect(posted).toEqual([
      {
        message: {
          source: MESSAGE_SOURCE,
          type: ERRORS_RESPONSE_TYPE,
          nonce: "n-1",
          records: [{ kind: "error", message: "one", at: NOW.toISOString() }],
        },
        origin: "https://example.test",
      },
    ]);
  });

  it.each([
    [
      "a foreign origin",
      { source: MESSAGE_SOURCE, type: ERRORS_REQUEST_TYPE, nonce: "n" },
      { origin: "https://evil.test" },
    ],
    [
      "another source window",
      { source: MESSAGE_SOURCE, type: ERRORS_REQUEST_TYPE, nonce: "n" },
      { source: {} },
    ],
    ["a missing nonce", { source: MESSAGE_SOURCE, type: ERRORS_REQUEST_TYPE }, {}],
    ["an empty nonce", { source: MESSAGE_SOURCE, type: ERRORS_REQUEST_TYPE, nonce: "" }, {}],
    ["a numeric nonce", { source: MESSAGE_SOURCE, type: ERRORS_REQUEST_TYPE, nonce: 1 }, {}],
    [
      "an oversized nonce",
      { source: MESSAGE_SOURCE, type: ERRORS_REQUEST_TYPE, nonce: "n".repeat(NONCE_MAX + 1) },
      {},
    ],
    ["a wrong type", { source: MESSAGE_SOURCE, type: ERRORS_RESPONSE_TYPE, nonce: "n" }, {}],
    ["a wrong tag", { source: "page", type: ERRORS_REQUEST_TYPE, nonce: "n" }, {}],
    ["a string", "errors.request", {}],
    ["null", null, {}],
  ])("does not answer %s", (_name, data, init) => {
    const { posted, request } = setup();

    request(data, init);

    expect(posted).toEqual([]);
  });

  it("does not throw when posting the answer is refused", () => {
    const { win, request } = setup();
    Object.assign(win, {
      postMessage: () => {
        throw new SyntaxError("Invalid target origin");
      },
    });

    expect(() => {
      request({ source: MESSAGE_SOURCE, type: ERRORS_REQUEST_TYPE, nonce: "n" });
    }).not.toThrow();
  });
});
