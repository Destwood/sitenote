import { describe, expect, it } from "vitest";

import {
  CONSOLE_ERRORS_MAX,
  CONSOLE_MESSAGE_MAX,
  CONSOLE_SOURCE_MAX,
  CONSOLE_STACK_MAX,
  CONTEXT_MAX_BYTES,
  CONTEXT_NAME_MAX,
  CONTEXT_TITLE_MAX,
  CONTEXT_URL_MAX,
  CONTEXT_USER_AGENT_MAX,
  RECORDING_PATH_MAX,
  RECORDING_STEPS_MAX,
  STEP_LABEL_MAX,
  STEP_SELECTOR_MAX,
  STEP_URL_MAX,
  consoleErrorRecordSchema,
  fitThreadContext,
  parseThreadContext,
  recordingStepSchema,
  sanitizeStep,
  sanitizeText,
  threadContextSchema,
  withRecording,
  withoutConsoleErrors,
  type ConsoleErrorRecord,
  type RecordingRef,
  type RecordingStep,
  type ThreadContext,
} from ".";

const AT = "2026-10-22T09:30:00.000Z";
const RECORDING: RecordingRef = {
  path: "10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002.webm",
  durationMs: 4200,
  size: 81920,
};
const STEP: RecordingStep = { t: 1200, kind: "click", selector: "button.save", label: "Save" };
const WIDE = "字";
const WORST_STEP: RecordingStep = {
  t: Number.MAX_SAFE_INTEGER,
  kind: "navigate",
  selector: WIDE.repeat(STEP_SELECTOR_MAX),
  label: WIDE.repeat(STEP_LABEL_MAX),
  url: WIDE.repeat(STEP_URL_MAX),
};
const WORST_RECORDING: RecordingRef = {
  path: WIDE.repeat(RECORDING_PATH_MAX),
  durationMs: Number.MAX_SAFE_INTEGER,
  size: Number.MAX_SAFE_INTEGER,
  steps: Array.from({ length: RECORDING_STEPS_MAX }, () => WORST_STEP),
};

function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

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

  it("accepts a recording with and without the optional field", () => {
    expect(threadContextSchema.safeParse(context({ recording: RECORDING })).success).toBe(true);
    expect(threadContextSchema.safeParse(context({ recording: undefined })).success).toBe(true);
    expect(threadContextSchema.safeParse(context()).success).toBe(true);
  });

  it("rejects a malformed recording", () => {
    const rejected: unknown[] = [
      { ...context(), recording: { ...RECORDING, size: -1 } },
      { ...context(), recording: { ...RECORDING, durationMs: -1 } },
      { ...context(), recording: { ...RECORDING, size: 1.5 } },
      { ...context(), recording: { ...RECORDING, durationMs: 0.5 } },
      { ...context(), recording: { ...RECORDING, path: "p".repeat(RECORDING_PATH_MAX + 1) } },
      { ...context(), recording: { path: RECORDING.path, size: 1 } },
    ];
    for (const value of rejected) {
      expect(threadContextSchema.safeParse(value).success).toBe(false);
    }
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

  it("drops a recording, which only the trusted background may add", () => {
    const fitted = fitThreadContext(context({ recording: RECORDING }));
    expect(fitted).not.toHaveProperty("recording");
    expect(fitted).toEqual(context());
  });

  it("leaves room for a recording added after fitting", () => {
    const heavy = Array.from({ length: CONSOLE_ERRORS_MAX }, () =>
      record({
        message: "m".repeat(CONSOLE_MESSAGE_MAX),
        source: "s".repeat(CONSOLE_SOURCE_MAX),
        stack: "k".repeat(CONSOLE_STACK_MAX),
      }),
    );
    const longest: RecordingRef = {
      path: WIDE.repeat(RECORDING_PATH_MAX),
      durationMs: Number.MAX_SAFE_INTEGER,
      size: Number.MAX_SAFE_INTEGER,
    };
    const parsed = parseThreadContext(
      withRecording(fitThreadContext(context({ consoleErrors: heavy })), longest),
    );
    expect(parsed?.recording).toEqual(longest);
  });
});

describe("parseThreadContext", () => {
  it("returns the context for a valid value and null otherwise", () => {
    expect(parseThreadContext(context())).toEqual(context());
    expect(parseThreadContext({})).toBeNull();
    expect(parseThreadContext(null)).toBeNull();
    expect(parseThreadContext({ ...context(), viewport: "wide" })).toBeNull();
  });

  it("keeps a recording that was attached with withRecording", () => {
    const attached = withRecording(context(), RECORDING);
    expect(parseThreadContext(attached)).toEqual(attached);
    expect(parseThreadContext(JSON.parse(JSON.stringify(attached)))?.recording).toEqual(RECORDING);
  });
});

describe("withoutConsoleErrors", () => {
  it("clears the errors and keeps the rest", () => {
    const stripped = withoutConsoleErrors(context({ consoleErrors: [record()] }));
    expect(stripped.consoleErrors).toEqual([]);
    expect(stripped.pageTitle).toBe("Northwind Studio");
  });
});

describe("withRecording", () => {
  it("adds the recording and keeps the rest of the context", () => {
    const original = context({ consoleErrors: [record()] });
    const attached = withRecording(original, RECORDING);
    expect(attached).toEqual({ ...original, recording: RECORDING });
    expect(original).not.toHaveProperty("recording");
  });
});

describe("recording steps", () => {
  it("accepts a recording with and without steps", () => {
    expect(
      threadContextSchema.safeParse(context({ recording: { ...RECORDING, steps: [STEP] } }))
        .success,
    ).toBe(true);
    expect(
      threadContextSchema.safeParse(context({ recording: { ...RECORDING, steps: [] } })).success,
    ).toBe(true);
    expect(threadContextSchema.safeParse(context({ recording: RECORDING })).success).toBe(true);
  });

  it("keeps the steps through a parse round trip", () => {
    const attached = withRecording(context(), { ...RECORDING, steps: [STEP] });
    expect(parseThreadContext(JSON.parse(JSON.stringify(attached)))?.recording?.steps).toEqual([
      STEP,
    ]);
  });

  it("accepts exactly the step limit and rejects one more", () => {
    const steps = Array.from({ length: RECORDING_STEPS_MAX }, () => STEP);
    expect(
      threadContextSchema.safeParse(context({ recording: { ...RECORDING, steps } })).success,
    ).toBe(true);
    expect(
      threadContextSchema.safeParse(
        context({ recording: { ...RECORDING, steps: [...steps, STEP] } }),
      ).success,
    ).toBe(false);
  });

  it("accepts steps at the string limits and rejects one character more", () => {
    const limits = [
      { selector: "s".repeat(STEP_SELECTOR_MAX) },
      { label: "l".repeat(STEP_LABEL_MAX) },
      { url: "u".repeat(STEP_URL_MAX) },
    ];
    for (const limit of limits) {
      expect(recordingStepSchema.safeParse({ ...STEP, ...limit }).success).toBe(true);
    }
    const overs = [
      { selector: "s".repeat(STEP_SELECTOR_MAX + 1) },
      { label: "l".repeat(STEP_LABEL_MAX + 1) },
      { url: "u".repeat(STEP_URL_MAX + 1) },
    ];
    for (const over of overs) {
      expect(recordingStepSchema.safeParse({ ...STEP, ...over }).success).toBe(false);
    }
  });

  it("rejects an unknown kind, a negative or fractional time and a missing selector", () => {
    const rejected: unknown[] = [
      { ...STEP, kind: "scroll" },
      { ...STEP, t: -1 },
      { ...STEP, t: 1.5 },
      { t: 1, kind: "click", label: "Save" },
      { ...STEP, url: undefined, label: undefined },
    ];
    for (const value of rejected) {
      expect(recordingStepSchema.safeParse(value).success).toBe(false);
    }
    expect(recordingStepSchema.safeParse({ ...STEP, url: undefined }).success).toBe(true);
  });

  it("rejects a recording with a malformed step", () => {
    const rejected: unknown[] = [
      { ...context(), recording: { ...RECORDING, steps: [{ ...STEP, kind: "scroll" }] } },
      { ...context(), recording: { ...RECORDING, steps: "click" } },
    ];
    for (const value of rejected) {
      expect(threadContextSchema.safeParse(value).success).toBe(false);
    }
  });

  it("fits the largest recording with steps into the context byte limit", () => {
    const worst = context({
      viewport: { width: Number.MAX_SAFE_INTEGER, height: Number.MAX_SAFE_INTEGER },
      devicePixelRatio: 16,
      pageTitle: "t".repeat(CONTEXT_TITLE_MAX),
      url: `https://example.com/${"a".repeat(CONTEXT_URL_MAX - 20)}`,
      browser: { name: "n".repeat(CONTEXT_NAME_MAX), version: "v".repeat(CONTEXT_NAME_MAX) },
      os: { name: "o".repeat(CONTEXT_NAME_MAX), version: "w".repeat(CONTEXT_NAME_MAX) },
      userAgent: "u".repeat(CONTEXT_USER_AGENT_MAX),
    });
    const attached = withRecording(worst, WORST_RECORDING);
    expect(byteSize(attached)).toBeLessThanOrEqual(CONTEXT_MAX_BYTES);
    expect(threadContextSchema.safeParse(attached).success).toBe(true);
  });

  it("keeps the largest recording within the limit next to full console errors", () => {
    const heavy = Array.from({ length: CONSOLE_ERRORS_MAX }, () =>
      record({
        message: "m".repeat(CONSOLE_MESSAGE_MAX),
        source: "s".repeat(CONSOLE_SOURCE_MAX),
        stack: "k".repeat(CONSOLE_STACK_MAX),
      }),
    );
    const attached = withRecording(
      fitThreadContext(context({ consoleErrors: heavy })),
      WORST_RECORDING,
    );
    expect(byteSize(attached)).toBeLessThanOrEqual(CONTEXT_MAX_BYTES);
    expect(parseThreadContext(attached)?.recording?.steps).toHaveLength(RECORDING_STEPS_MAX);
  });

  it("keeps a maximal wide-character recording valid next to full console errors", () => {
    const heavy = Array.from({ length: CONSOLE_ERRORS_MAX }, () =>
      record({
        message: "m".repeat(CONSOLE_MESSAGE_MAX),
        source: "s".repeat(CONSOLE_SOURCE_MAX),
        stack: "k".repeat(CONSOLE_STACK_MAX),
      }),
    );
    const attached = withRecording(
      fitThreadContext(context({ consoleErrors: heavy })),
      WORST_RECORDING,
    );
    expect(byteSize(attached)).toBeLessThanOrEqual(CONTEXT_MAX_BYTES);
    expect(threadContextSchema.safeParse(attached).success).toBe(true);
  });

  it("drops a recording with steps when fitting the context", () => {
    const fitted = fitThreadContext(context({ recording: { ...RECORDING, steps: [STEP] } }));
    expect(fitted).not.toHaveProperty("recording");
  });
});

describe("sanitizeStep", () => {
  it("keeps a step that is already within the limits", () => {
    expect(sanitizeStep(STEP)).toEqual(STEP);
    expect(sanitizeStep({ ...STEP, url: "https://example.test/a" })).toEqual({
      ...STEP,
      url: "https://example.test/a",
    });
  });

  it("truncates the selector, label and url to their limits", () => {
    const sanitized = sanitizeStep({
      t: 1,
      kind: "navigate",
      selector: "s".repeat(STEP_SELECTOR_MAX + 5),
      label: "l".repeat(STEP_LABEL_MAX + 5),
      url: "u".repeat(STEP_URL_MAX + 5),
    });
    expect(sanitized.selector).toBe("s".repeat(STEP_SELECTOR_MAX));
    expect(sanitized.label).toBe("l".repeat(STEP_LABEL_MAX));
    expect(sanitized.url).toBe("u".repeat(STEP_URL_MAX));
    expect(recordingStepSchema.safeParse(sanitized).success).toBe(true);
  });

  it("never splits a surrogate pair when truncating", () => {
    const sanitized = sanitizeStep({ ...STEP, label: "😀".repeat(STEP_LABEL_MAX) });
    expect(sanitized.label).toBe("😀".repeat(STEP_LABEL_MAX / 2));
    expect(recordingStepSchema.safeParse(sanitized).success).toBe(true);
  });

  it("collapses the whitespace of the label and trims it", () => {
    expect(sanitizeStep({ ...STEP, label: "  Save \n\t draft  " }).label).toBe("Save draft");
  });

  it("removes NUL characters and replaces lone surrogates", () => {
    expect(sanitizeStep({ ...STEP, selector: "a\u0000b\uD800", label: "x\uDC00" })).toMatchObject({
      selector: "ab�",
      label: "x�",
    });
  });

  it("leaves out an url that was not given", () => {
    expect(sanitizeStep({ ...STEP, url: undefined })).not.toHaveProperty("url");
  });

  it("strips every control character from the selector and the url", () => {
    const control = "a\u0001\u001f\u007f\u0080\u009fb";
    expect(sanitizeStep({ ...STEP, selector: control, url: `/x${control}` })).toMatchObject({
      selector: "ab",
      url: "/xab",
    });
  });

  it("turns line breaks in the label into spaces and strips the other control characters", () => {
    expect(sanitizeStep({ ...STEP, label: "Save\nthe\r\ndraft" }).label).toBe("Save the draft");
    expect(sanitizeStep({ ...STEP, label: "Sa\u0001ve\u0085 now" }).label).toBe("Save now");
    expect(sanitizeStep({ ...STEP, label: "a \u0007 b" }).label).toBe("a b");
  });

  it("strips control characters before truncating so the byte budget holds", () => {
    const sanitized = sanitizeStep({ ...STEP, label: "\u0001".repeat(STEP_LABEL_MAX) + "x" });
    expect(sanitized.label).toBe("x");
    expect(sanitizeStep({ ...STEP, selector: "\u0001s".repeat(STEP_SELECTOR_MAX) }).selector).toBe(
      "s".repeat(STEP_SELECTOR_MAX),
    );
  });
});
