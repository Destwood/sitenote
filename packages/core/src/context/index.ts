import * as z from "zod/mini";

export const CONSOLE_ERROR_KINDS = ["error", "unhandledrejection", "console.error"] as const;
export const CONSOLE_ERRORS_MAX = 20;
export const CONSOLE_MESSAGE_MAX = 1000;
export const CONSOLE_SOURCE_MAX = 500;
export const CONSOLE_STACK_MAX = 4000;
export const NETWORK_ERRORS_MAX = 20;
export const NETWORK_METHOD_MAX = 10;
export const NETWORK_URL_MAX = 300;
export const NETWORK_STATUS_TEXT_MAX = 60;
export const TIMESTAMP_MAX = 40;
export const CONTEXT_TITLE_MAX = 300;
export const CONTEXT_URL_MAX = 2048;
export const CONTEXT_USER_AGENT_MAX = 512;
export const CONTEXT_NAME_MAX = 100;
export const CONTEXT_MAX_BYTES = 48000;
export const RECORDING_PATH_MAX = 200;
export const RECORDING_STEPS_MAX = 40;
export const RECORDING_START_URL_MAX = 2048;
export const STEP_SELECTOR_MAX = 100;
export const STEP_LABEL_MAX = 40;
export const STEP_URL_MAX = 100;

const nonNegativeInteger = z.int().check(z.gte(0));
const shortText = z.string().check(z.maxLength(CONTEXT_NAME_MAX));

export const recordingStepSchema = z.object({
  t: nonNegativeInteger,
  kind: z.enum(["click", "input", "submit", "navigate"]),
  selector: z.string().check(z.maxLength(STEP_SELECTOR_MAX)),
  label: z.string().check(z.maxLength(STEP_LABEL_MAX)),
  url: z.optional(z.string().check(z.maxLength(STEP_URL_MAX))),
  sensitive: z.optional(z.boolean()),
});

export type RecordingStep = z.infer<typeof recordingStepSchema>;

export const recordingRefSchema = z.object({
  path: z.string().check(z.maxLength(RECORDING_PATH_MAX)),
  durationMs: nonNegativeInteger,
  size: nonNegativeInteger,
  steps: z.optional(z.array(recordingStepSchema).check(z.maxLength(RECORDING_STEPS_MAX))),
  startUrl: z.optional(z.string().check(z.maxLength(RECORDING_START_URL_MAX))),
  startsSignedOut: z.optional(z.boolean()),
});

export type RecordingRef = z.infer<typeof recordingRefSchema>;

export interface ReplaySource {
  threadId: string;
  pageUrl: string;
  startUrl: string | null;
  startsSignedOut: boolean;
  steps: RecordingStep[];
}

export const consoleErrorRecordSchema = z.object({
  kind: z.enum(CONSOLE_ERROR_KINDS),
  message: z.string().check(z.maxLength(CONSOLE_MESSAGE_MAX)),
  source: z.optional(z.string().check(z.maxLength(CONSOLE_SOURCE_MAX))),
  line: z.optional(nonNegativeInteger),
  column: z.optional(nonNegativeInteger),
  stack: z.optional(z.string().check(z.maxLength(CONSOLE_STACK_MAX))),
  at: z.optional(z.iso.datetime().check(z.maxLength(TIMESTAMP_MAX))),
});

export type ConsoleErrorKind = (typeof CONSOLE_ERROR_KINDS)[number];
export type ConsoleErrorRecord = z.infer<typeof consoleErrorRecordSchema>;

export const networkErrorRecordSchema = z.object({
  kind: z.enum(["fetch", "xhr"]),
  method: z.string().check(z.maxLength(NETWORK_METHOD_MAX)),
  url: z.string().check(z.maxLength(NETWORK_URL_MAX)),
  status: z.int().check(z.gte(0), z.lte(599)),
  statusText: z.optional(z.string().check(z.maxLength(NETWORK_STATUS_TEXT_MAX))),
  durationMs: z.optional(nonNegativeInteger),
  at: z.optional(z.iso.datetime().check(z.maxLength(TIMESTAMP_MAX))),
});

export type NetworkErrorRecord = z.infer<typeof networkErrorRecordSchema>;

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

const WIDEST_CHARACTER = "字";
const RECORDING_STEP_SAMPLE: RecordingStep = {
  t: Number.MAX_SAFE_INTEGER,
  kind: "navigate",
  selector: WIDEST_CHARACTER.repeat(STEP_SELECTOR_MAX),
  label: WIDEST_CHARACTER.repeat(STEP_LABEL_MAX),
  url: WIDEST_CHARACTER.repeat(STEP_URL_MAX),
  sensitive: true,
};
const RECORDING_MAX_BYTES = byteLength({
  recording: {
    path: WIDEST_CHARACTER.repeat(RECORDING_PATH_MAX),
    durationMs: Number.MAX_SAFE_INTEGER,
    size: Number.MAX_SAFE_INTEGER,
    steps: Array.from({ length: RECORDING_STEPS_MAX }, () => RECORDING_STEP_SAMPLE),
    startUrl: WIDEST_CHARACTER.repeat(RECORDING_START_URL_MAX),
    startsSignedOut: true,
  },
});
const FITTED_MAX_BYTES = CONTEXT_MAX_BYTES - RECORDING_MAX_BYTES;

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
    networkErrors: z.optional(
      z.array(networkErrorRecordSchema).check(z.maxLength(NETWORK_ERRORS_MAX)),
    ),
    capturedAt: z.iso.datetime(),
    recording: z.optional(recordingRefSchema),
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
  const { source, stack, at } = record;
  const { line, column } = record;
  return {
    kind: record.kind,
    message: sanitizeText(record.message),
    ...(source === undefined ? {} : { source: sanitizeText(source) }),
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
    ...(stack === undefined ? {} : { stack: sanitizeText(stack) }),
    ...(at === undefined ? {} : { at }),
  };
}

function sanitizeNetworkRecord(record: NetworkErrorRecord): NetworkErrorRecord {
  const { statusText, durationMs, at } = record;
  return {
    kind: record.kind,
    method: sanitizeText(record.method),
    url: sanitizeText(record.url),
    status: record.status,
    ...(statusText === undefined ? {} : { statusText: sanitizeText(statusText) }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(at === undefined ? {} : { at }),
  };
}

function truncate(value: string, max: number): string {
  let kept = "";
  for (const character of value) {
    if (kept.length + character.length > max) {
      break;
    }
    kept += character;
  }
  return kept;
}

const WHITESPACE_RUN = /\s+/g;

function isControlUnit(unit: string): boolean {
  const code = unit.charCodeAt(0);
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

function stripControls(value: string): string {
  return sanitizeText(value)
    .split("")
    .filter((unit) => !isControlUnit(unit))
    .join("");
}

function collapseWhitespace(value: string): string {
  return value.replace(WHITESPACE_RUN, " ").trim();
}

export function sanitizeStep(step: RecordingStep): RecordingStep {
  const { url } = step;
  return {
    t: step.t,
    kind: step.kind,
    selector: truncate(stripControls(step.selector), STEP_SELECTOR_MAX),
    label: truncate(
      collapseWhitespace(stripControls(collapseWhitespace(step.label))),
      STEP_LABEL_MAX,
    ),
    ...(url === undefined ? {} : { url: truncate(stripControls(url), STEP_URL_MAX) }),
    ...(step.sensitive === true ? { sensitive: true } : {}),
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
    ...(context.networkErrors === undefined
      ? {}
      : { networkErrors: context.networkErrors.map(sanitizeNetworkRecord) }),
    capturedAt: context.capturedAt,
  };
  while (byteLength(fitted) > FITTED_MAX_BYTES) {
    if (fitted.networkErrors !== undefined && fitted.networkErrors.length > 0) {
      fitted = { ...fitted, networkErrors: fitted.networkErrors.slice(1) };
    } else if (fitted.consoleErrors.length > 0) {
      fitted = { ...fitted, consoleErrors: fitted.consoleErrors.slice(1) };
    } else {
      break;
    }
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

export function withRecording(context: ThreadContext, recording: RecordingRef): ThreadContext {
  return { ...context, recording };
}
