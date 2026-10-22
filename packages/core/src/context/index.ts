import * as z from "zod/mini";

export const CONSOLE_ERROR_KINDS = ["error", "unhandledrejection", "console.error"] as const;
export const CONSOLE_ERRORS_MAX = 20;
export const CONSOLE_MESSAGE_MAX = 1000;
export const CONSOLE_SOURCE_MAX = 500;
export const CONSOLE_STACK_MAX = 4000;
export const CONTEXT_TITLE_MAX = 300;
export const CONTEXT_URL_MAX = 2048;
export const CONTEXT_USER_AGENT_MAX = 512;
export const CONTEXT_NAME_MAX = 100;
export const CONTEXT_MAX_BYTES = 48000;

const nonNegativeInteger = z.int().check(z.gte(0));
const shortText = z.string().check(z.maxLength(CONTEXT_NAME_MAX));

export const consoleErrorRecordSchema = z.object({
  kind: z.enum(CONSOLE_ERROR_KINDS),
  message: z.string().check(z.maxLength(CONSOLE_MESSAGE_MAX)),
  source: z.optional(z.string().check(z.maxLength(CONSOLE_SOURCE_MAX))),
  line: z.optional(nonNegativeInteger),
  column: z.optional(nonNegativeInteger),
  stack: z.optional(z.string().check(z.maxLength(CONSOLE_STACK_MAX))),
  at: z.iso.datetime(),
});

export type ConsoleErrorKind = (typeof CONSOLE_ERROR_KINDS)[number];
export type ConsoleErrorRecord = z.infer<typeof consoleErrorRecordSchema>;

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export const threadContextSchema = z
  .object({
    viewport: z.object({
      width: nonNegativeInteger,
      height: nonNegativeInteger,
    }),
    devicePixelRatio: z.number().check(z.gt(0), z.lte(16)),
    pageTitle: z.string().check(z.maxLength(CONTEXT_TITLE_MAX)),
    url: z.string().check(z.maxLength(CONTEXT_URL_MAX)),
    browser: z.object({ name: shortText, version: shortText }),
    os: z.object({ name: shortText, version: z.optional(shortText) }),
    userAgent: z.string().check(z.maxLength(CONTEXT_USER_AGENT_MAX)),
    consoleErrors: z.array(consoleErrorRecordSchema).check(z.maxLength(CONSOLE_ERRORS_MAX)),
    capturedAt: z.iso.datetime(),
  })
  .check(z.refine((context) => byteLength(context) <= CONTEXT_MAX_BYTES));

export type ThreadContext = z.infer<typeof threadContextSchema>;

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function sanitizeText(value: string): string {
  return value.replaceAll("\u0000", "").replace(LONE_SURROGATE, "�");
}

function sanitizeOptional(value: string | undefined): string | undefined {
  return value === undefined ? undefined : sanitizeText(value);
}

function sanitizeRecord(record: ConsoleErrorRecord): ConsoleErrorRecord {
  const { source, stack } = record;
  const { line, column } = record;
  return {
    kind: record.kind,
    message: sanitizeText(record.message),
    ...(source === undefined ? {} : { source: sanitizeText(source) }),
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
    ...(stack === undefined ? {} : { stack: sanitizeText(stack) }),
    at: record.at,
  };
}

export function fitThreadContext(context: ThreadContext): ThreadContext {
  const version = sanitizeOptional(context.os.version);
  let fitted: ThreadContext = {
    viewport: context.viewport,
    devicePixelRatio: context.devicePixelRatio,
    pageTitle: sanitizeText(context.pageTitle),
    url: sanitizeText(context.url),
    browser: {
      name: sanitizeText(context.browser.name),
      version: sanitizeText(context.browser.version),
    },
    os:
      version === undefined
        ? { name: sanitizeText(context.os.name) }
        : {
            name: sanitizeText(context.os.name),
            version,
          },
    userAgent: sanitizeText(context.userAgent),
    consoleErrors: context.consoleErrors.map(sanitizeRecord),
    capturedAt: context.capturedAt,
  };
  while (fitted.consoleErrors.length > 0 && byteLength(fitted) > CONTEXT_MAX_BYTES) {
    fitted = { ...fitted, consoleErrors: fitted.consoleErrors.slice(1) };
  }
  return fitted;
}

export function parseThreadContext(value: unknown): ThreadContext | null {
  const parsed = threadContextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function withoutConsoleErrors(context: ThreadContext): ThreadContext {
  return { ...context, consoleErrors: [] };
}
