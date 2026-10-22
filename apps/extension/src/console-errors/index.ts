export const MESSAGE_SOURCE = "sitenote";
export const ERRORS_REQUEST_TYPE = "errors.request";
export const ERRORS_RESPONSE_TYPE = "errors.response";
export const BUFFER_SIZE = 20;
export const MESSAGE_MAX = 1000;
export const SOURCE_MAX = 500;
export const STACK_MAX = 4000;
export const NONCE_MAX = 100;
export const FORMAT_BUDGET = 1500;
export const FORMAT_DEPTH = 3;
export const FORMAT_ITEMS = 10;

const WRAPPED_MARK = Symbol.for("sitenote.consoleErrors.wrapped");

export type ErrorKind = "error" | "unhandledrejection" | "console.error";

export interface ErrorRecord {
  kind: ErrorKind;
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
  at: string;
}

export interface RecordInput {
  kind: ErrorKind;
  message: string;
  source?: string | undefined;
  line?: number | undefined;
  column?: number | undefined;
  stack?: string | undefined;
}

export interface ErrorBuffer {
  push: (input: RecordInput) => void;
  snapshot: () => ErrorRecord[];
}

export interface CaptureTarget extends EventTarget {
  location: { origin: string };
  console: { error: (...data: unknown[]) => void };
  postMessage: (message: unknown, targetOrigin: string) => void;
}

interface Budget {
  left: number;
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function take(budget: Budget, text: string): string {
  if (budget.left <= 0) {
    return "";
  }
  const piece = clip(text, budget.left);
  budget.left -= piece.length;
  return piece;
}

function isNode(value: object): value is Node {
  return typeof Node === "function" && value instanceof Node;
}

function describeError(error: Error): string {
  return `${error.name}: ${error.message}`;
}

function formatObject(value: object, depth: number, seen: WeakSet<object>, budget: Budget): string {
  if (value instanceof Error) {
    return take(budget, describeError(value));
  }
  if (isNode(value)) {
    return take(budget, `<${value.nodeName.toLowerCase()}>`);
  }
  if (seen.has(value)) {
    return take(budget, "[Circular]");
  }
  if (depth <= 0) {
    return take(budget, Array.isArray(value) ? `[Array(${String(value.length)})]` : "[Object]");
  }
  seen.add(value);
  const parts: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value.slice(0, FORMAT_ITEMS)) {
      parts.push(formatValue(item, depth - 1, seen, budget));
    }
    if (value.length > FORMAT_ITEMS) {
      parts.push("…");
    }
    seen.delete(value);
    return `[${parts.join(", ")}]`;
  }
  const keys = Object.keys(value);
  for (const key of keys.slice(0, FORMAT_ITEMS)) {
    parts.push(
      `${take(budget, key)}: ${formatValue(Reflect.get(value, key), depth - 1, seen, budget)}`,
    );
  }
  if (keys.length > FORMAT_ITEMS) {
    parts.push("…");
  }
  seen.delete(value);
  return `{${parts.join(", ")}}`;
}

function formatValue(value: unknown, depth: number, seen: WeakSet<object>, budget: Budget): string {
  try {
    switch (typeof value) {
      case "string":
        return take(budget, value);
      case "number":
      case "boolean":
      case "bigint":
      case "undefined":
        return take(budget, String(value));
      case "symbol":
        return take(budget, value.toString());
      case "function":
        return take(budget, `[Function ${value.name === "" ? "anonymous" : value.name}]`);
      case "object":
        return value === null ? take(budget, "null") : formatObject(value, depth, seen, budget);
    }
  } catch {
    return take(budget, "[Unserializable]");
  }
}

export function formatArguments(args: readonly unknown[]): string {
  const budget: Budget = { left: FORMAT_BUDGET };
  return args.map((arg) => formatValue(arg, FORMAT_DEPTH, new WeakSet(), budget)).join(" ");
}

function nonNegativeInteger(value: number | undefined): number | undefined {
  return value !== undefined && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function createErrorBuffer(now: () => Date = () => new Date()): ErrorBuffer {
  const records: ErrorRecord[] = [];
  return {
    push: (input) => {
      const record: ErrorRecord = {
        kind: input.kind,
        message: clip(input.message, MESSAGE_MAX),
        at: now().toISOString(),
      };
      if (input.source !== undefined && input.source !== "") {
        record.source = clip(input.source, SOURCE_MAX);
      }
      const line = nonNegativeInteger(input.line);
      if (line !== undefined) {
        record.line = line;
      }
      const column = nonNegativeInteger(input.column);
      if (column !== undefined) {
        record.column = column;
      }
      if (input.stack !== undefined && input.stack !== "") {
        record.stack = clip(input.stack, STACK_MAX);
      }
      records.push(record);
      if (records.length > BUFFER_SIZE) {
        records.shift();
      }
    },
    snapshot: () => records.map((record) => ({ ...record })),
  };
}

function stackOf(value: unknown): string | undefined {
  return value instanceof Error && typeof value.stack === "string" ? value.stack : undefined;
}

function readRequestNonce(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const source: unknown = Reflect.get(data, "source");
  const type: unknown = Reflect.get(data, "type");
  const nonce: unknown = Reflect.get(data, "nonce");
  return source === MESSAGE_SOURCE &&
    type === ERRORS_REQUEST_TYPE &&
    typeof nonce === "string" &&
    nonce.length > 0 &&
    nonce.length <= NONCE_MAX
    ? nonce
    : null;
}

function safely(task: () => void): void {
  try {
    task();
  } catch {
    return;
  }
}

function hasMark(target: unknown): boolean {
  return typeof target === "function" && Reflect.get(target, WRAPPED_MARK) === true;
}

export function installErrorCapture(win: CaptureTarget, buffer: ErrorBuffer): void {
  if (hasMark(win.console.error)) {
    return;
  }

  win.addEventListener(
    "error",
    (event) => {
      if (!(event instanceof ErrorEvent)) {
        return;
      }
      buffer.push({
        kind: "error",
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: stackOf(event.error),
      });
    },
    true,
  );

  win.addEventListener("unhandledrejection", (event) => {
    const reason: unknown = Reflect.get(event, "reason");
    buffer.push({
      kind: "unhandledrejection",
      message: `Uncaught (in promise) ${formatArguments([reason])}`,
      stack: stackOf(reason),
    });
  });

  win.addEventListener("message", (event) => {
    if (!(event instanceof MessageEvent)) {
      return;
    }
    const sender: EventTarget | null = event.source;
    if (sender !== win || event.origin !== win.location.origin) {
      return;
    }
    const nonce = readRequestNonce(event.data);
    if (nonce === null) {
      return;
    }
    try {
      win.postMessage(
        {
          source: MESSAGE_SOURCE,
          type: ERRORS_RESPONSE_TYPE,
          nonce,
          records: buffer.snapshot(),
        },
        win.location.origin,
      );
    } catch {
      return;
    }
  });

  const original = win.console.error;
  const wrapped = function (this: unknown, ...args: unknown[]): void {
    safely(() => {
      buffer.push({
        kind: "console.error",
        message: formatArguments(args),
        stack: args.map(stackOf).find((stack) => stack !== undefined),
      });
    });
    Reflect.apply(original, this, args);
  };
  Object.defineProperty(wrapped, WRAPPED_MARK, { value: true });
  try {
    win.console.error = wrapped;
  } catch {
    return;
  }
}
