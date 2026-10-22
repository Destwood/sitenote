import { describe, expect, it } from "vitest";

import {
  CONSOLE_ERRORS_MAX,
  CONSOLE_MESSAGE_MAX,
  CONSOLE_SOURCE_MAX,
  CONSOLE_STACK_MAX,
  CONTEXT_MAX_BYTES,
  consoleErrorRecordSchema,
  fitThreadContext,
  parseThreadContext,
  sanitizeText,
  threadContextSchema,
  withoutConsoleErrors,
  type ConsoleErrorRecord,
  type ThreadContext,
} from ".";

const AT = "2026-10-22T09:30:00.000Z";

function record(overrides: Partial<ConsoleErrorRecord> = {}): ConsoleErrorRecord {
  return { kind: "error", message: "Boom", at: AT, ...overrides };
}

function context(overrides: Partial<ThreadContext> = {}): ThreadContext {
  return {
    viewport: { width: 1440, height: 900 },
    devicePixelRatio: 2,
    pageTitle: "Northwind Studio",
    url: "https://example.com/pricing?plan=pro",
    browser: { name: "Chrome", version: "130.0.6723.92" },
    os: { name: "macOS", version: "14.5" },
    userAgent: "Mozilla/5.0",
    consoleErrors: [],
    capturedAt: AT,
    ...overrides,
  };
}

describe("consoleErrorRecordSchema", () => {
  it("accepts every kind and the optional fields", () => {
    for (const kind of ["error", "unhandledrejection", "console.error"] as const) {
      expect(consoleErrorRecordSchema.safeParse(record({ kind })).success).toBe(true);
    }
    expect(
      consoleErrorRecordSchema.safeParse(
        record({ source: "https://example.com/app.js", line: 12, column: 4, stack: "at x" }),
      ).success,
    ).toBe(true);
  });

  it("rejects unknown kinds, over-long fields, bad numbers and bad dates", () => {
    const rejected: unknown[] = [
      { ...record(), kind: "warn" },
      record({ message: "x".repeat(CONSOLE_MESSAGE_MAX + 1) }),
      record({ source: "x".repeat(CONSOLE_SOURCE_MAX + 1) }),
      record({ stack: "x".repeat(CONSOLE_STACK_MAX + 1) }),
      record({ line: -1 }),
      record({ column: 1.5 }),
      record({ at: "yesterday" }),
      { kind: "error", at: AT },
      null,
      "text",
    ];
    for (const value of rejected) {
      expect(consoleErrorRecordSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts the limits exactly", () => {
    expect(
      consoleErrorRecordSchema.safeParse(
        record({
          message: "x".repeat(CONSOLE_MESSAGE_MAX),
          source: "x".repeat(CONSOLE_SOURCE_MAX),
          stack: "x".repeat(CONSOLE_STACK_MAX),
        }),
      ).success,
    ).toBe(true);
  });
});

describe("threadContextSchema", () => {
  it("accepts a complete context with and without the os version", () => {
    expect(threadContextSchema.safeParse(context()).success).toBe(true);
    expect(threadContextSchema.safeParse(context({ os: { name: "Linux" } })).success).toBe(true);
    expect(
      threadContextSchema.safeParse(context({ consoleErrors: [record(), record({ line: 3 })] }))
        .success,
    ).toBe(true);
  });

  it("rejects values outside the documented limits", () => {
    const rejected: unknown[] = [
      context({ pageTitle: "t".repeat(301) }),
      context({ url: `https://example.com/${"a".repeat(2048)}` }),
      context({ userAgent: "u".repeat(513) }),
      context({ devicePixelRatio: 0 }),
      context({ devicePixelRatio: Number.NaN }),
      context({ devicePixelRatio: 17 }),
      context({ viewport: { width: -1, height: 10 } }),
      context({ viewport: { width: 10.5, height: 10 } }),
      context({ capturedAt: "2026-10-22" }),
      context({ consoleErrors: Array.from({ length: CONSOLE_ERRORS_MAX + 1 }, () => record()) }),
      { ...context(), browser: { name: "Chrome" } },
      {},
      null,
    ];
    for (const value of rejected) {
      expect(threadContextSchema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects a context larger than the byte budget", () => {
    const heavy = Array.from({ length: CONSOLE_ERRORS_MAX }, () =>
      record({
        message: "m".repeat(CONSOLE_MESSAGE_MAX),
        source: "s".repeat(CONSOLE_SOURCE_MAX),
        stack: "k".repeat(CONSOLE_STACK_MAX),
      }),
    );
    expect(threadContextSchema.safeParse(context({ consoleErrors: heavy })).success).toBe(false);
  });
});

describe("sanitizeText", () => {
  it("removes NUL characters and replaces lone surrogates", () => {
    expect(sanitizeText("a\u0000b")).toBe("ab");
    expect(sanitizeText("a\uD800b")).toBe("a�b");
    expect(sanitizeText("a\uDC00b")).toBe("a�b");
    expect(sanitizeText("x\uD83D")).toBe("x�");
  });

  it("keeps valid surrogate pairs and ordinary text", () => {
    expect(sanitizeText("emoji 😀 ok")).toBe("emoji 😀 ok");
    expect(sanitizeText("Привіт, світе")).toBe("Привіт, світе");
  });
});

describe("fitThreadContext", () => {
  it("returns an equal context when nothing needs fixing", () => {
    const input = context({ consoleErrors: [record({ line: 4, column: 2, stack: "at x" })] });
    expect(fitThreadContext(input)).toEqual(input);
  });

  it("sanitizes every string, including the optional ones", () => {
    const fitted = fitThreadContext(
      context({
        pageTitle: "a\u0000b",
        url: "https://example.com/\uD800",
        userAgent: "ua\u0000",
        browser: { name: "C\u0000", version: "1\uDC00" },
        os: { name: "O\u0000", version: "2\u0000" },
        consoleErrors: [
          record({ message: "m\u0000", source: "s\uD800", stack: "k\u0000" }),
          record({ message: "plain" }),
        ],
      }),
    );
    expect(fitted.pageTitle).toBe("ab");
    expect(fitted.url).toBe("https://example.com/�");
    expect(fitted.userAgent).toBe("ua");
    expect(fitted.browser).toEqual({ name: "C", version: "1�" });
    expect(fitted.os).toEqual({ name: "O", version: "2" });
    expect(fitted.consoleErrors[0]).toMatchObject({ message: "m", source: "s�", stack: "k" });
    expect(fitted.consoleErrors[1]).toEqual(record({ message: "plain" }));
    expect(threadContextSchema.safeParse(fitted).success).toBe(true);
  });

  it("drops the oldest console errors until the context fits the byte budget", () => {
    const heavy = Array.from({ length: CONSOLE_ERRORS_MAX }, (_, index) =>
      record({
        message: `${String(index)}:${"é".repeat(CONSOLE_MESSAGE_MAX - 3)}`,
        source: "s".repeat(CONSOLE_SOURCE_MAX),
        stack: "k".repeat(CONSOLE_STACK_MAX),
      }),
    );
    const fitted = fitThreadContext(context({ consoleErrors: heavy }));
    expect(fitted.consoleErrors.length).toBeGreaterThan(0);
    expect(fitted.consoleErrors.length).toBeLessThan(CONSOLE_ERRORS_MAX);
    expect(fitted.consoleErrors.at(-1)?.message.startsWith("19:")).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(fitted)).length).toBeLessThanOrEqual(
      CONTEXT_MAX_BYTES,
    );
    expect(threadContextSchema.safeParse(fitted).success).toBe(true);
  });
});

describe("parseThreadContext", () => {
  it("returns the context for a valid value and null otherwise", () => {
    expect(parseThreadContext(context())).toEqual(context());
    expect(parseThreadContext({})).toBeNull();
    expect(parseThreadContext(null)).toBeNull();
    expect(parseThreadContext({ ...context(), viewport: "wide" })).toBeNull();
  });
});

describe("withoutConsoleErrors", () => {
  it("clears the errors and keeps the rest", () => {
    const stripped = withoutConsoleErrors(context({ consoleErrors: [record()] }));
    expect(stripped.consoleErrors).toEqual([]);
    expect(stripped.pageTitle).toBe("Northwind Studio");
  });
});
