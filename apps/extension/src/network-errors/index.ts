import type { NetworkErrorRecord } from "@sitenote/core";

export const BUFFER_SIZE = 20;
export const URL_MAX = 300;
export const METHOD_MAX = 10;
export const STATUS_TEXT_MAX = 60;

const WRAPPED_MARK = Symbol.for("sitenote.networkErrors.wrapped");

export interface NetworkRecordInput {
  kind: NetworkErrorRecord["kind"];
  method: string;
  url: string;
  status: number;
  statusText?: string | undefined;
  durationMs?: number | undefined;
}

export interface NetworkBuffer {
  push: (input: NetworkRecordInput) => void;
  snapshot: () => NetworkErrorRecord[];
}

export interface NetworkCaptureTarget {
  location: { href: string };
  fetch: typeof fetch;
  XMLHttpRequest: typeof XMLHttpRequest;
}

interface RequestTarget {
  method: string;
  url: string;
}

type XhrMethod = (this: XMLHttpRequest, ...args: unknown[]) => void;

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function safely(task: () => void): void {
  try {
    task();
  } catch {
    return;
  }
}

function tryValue<T>(task: () => T): T | undefined {
  try {
    return task();
  } catch {
    return undefined;
  }
}

function hasMark(target: unknown): boolean {
  return typeof target === "function" && Reflect.get(target, WRAPPED_MARK) === true;
}

function markWrapped(target: object): void {
  Object.defineProperty(target, WRAPPED_MARK, { value: true });
}

function elapsed(started: number): number {
  return Math.max(0, Math.round(performance.now() - started));
}

function publicUrl(raw: string, base: string): string | undefined {
  const url = new URL(raw, base);
  return url.protocol === "https:" || url.protocol === "http:"
    ? `${url.origin}${url.pathname}`
    : undefined;
}

function describeFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  base: string,
): RequestTarget | undefined {
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const url = publicUrl(input instanceof Request ? input.url : String(input), base);
  return url === undefined ? undefined : { method: method.toUpperCase(), url };
}

function wrapFetch(original: typeof fetch, win: NetworkCaptureTarget, buffer: NetworkBuffer) {
  const wrapped = function (this: unknown, ...args: Parameters<typeof fetch>): Promise<Response> {
    const started = performance.now();
    const target = tryValue(() => describeFetch(args[0], args[1], win.location.href));
    const promise = Reflect.apply(original, this, args);
    if (target !== undefined) {
      void promise.then(
        (response) => {
          safely(() => {
            if (response.status >= 400 && response.status <= 599) {
              buffer.push({
                kind: "fetch",
                method: target.method,
                url: target.url,
                status: response.status,
                statusText: response.statusText,
                durationMs: elapsed(started),
              });
            }
          });
        },
        (error: unknown) => {
          safely(() => {
            if (error instanceof TypeError) {
              buffer.push({
                kind: "fetch",
                method: target.method,
                url: target.url,
                status: 0,
                durationMs: elapsed(started),
              });
            }
          });
        },
      );
    }
    return promise;
  };
  markWrapped(wrapped);
  return wrapped;
}

function wrapXhr(proto: XMLHttpRequest, win: NetworkCaptureTarget, buffer: NetworkBuffer): void {
  const targets = new WeakMap<XMLHttpRequest, RequestTarget | undefined>();
  const originalOpen = Reflect.get(proto, "open") as XhrMethod;
  const originalSend = Reflect.get(proto, "send") as XhrMethod;

  const open = function (this: XMLHttpRequest, ...args: unknown[]): void {
    safely(() => {
      targets.set(
        this,
        tryValue(() => {
          const method = String(args[0]).toUpperCase();
          const url = publicUrl(String(args[1]), win.location.href);
          return url === undefined ? undefined : { method, url };
        }),
      );
    });
    Reflect.apply(originalOpen, this, args);
  };

  const send = function (this: XMLHttpRequest, ...args: unknown[]): void {
    safely(() => {
      const target = targets.get(this);
      if (target === undefined) {
        return;
      }
      const started = performance.now();
      let failed = false;
      const fail = (): void => {
        failed = true;
      };
      this.addEventListener("error", fail);
      this.addEventListener("timeout", fail);
      this.addEventListener(
        "loadend",
        () => {
          safely(() => {
            const { status, statusText } = this;
            if (status >= 400 && status <= 599) {
              buffer.push({
                kind: "xhr",
                method: target.method,
                url: target.url,
                status,
                statusText,
                durationMs: elapsed(started),
              });
            } else if (failed) {
              buffer.push({
                kind: "xhr",
                method: target.method,
                url: target.url,
                status: 0,
                durationMs: elapsed(started),
              });
            }
          });
        },
        { once: true },
      );
    });
    Reflect.apply(originalSend, this, args);
  };

  safely(() => {
    proto.open = open;
    proto.send = send;
    markWrapped(win.XMLHttpRequest);
  });
}

export function createNetworkBuffer(now: () => Date = () => new Date()): NetworkBuffer {
  const records: NetworkErrorRecord[] = [];
  return {
    push: (input) => {
      const record: NetworkErrorRecord = {
        kind: input.kind,
        method: clip(input.method, METHOD_MAX),
        url: clip(input.url, URL_MAX),
        status: input.status,
        at: now().toISOString(),
      };
      if (input.statusText !== undefined && input.statusText !== "") {
        record.statusText = clip(input.statusText, STATUS_TEXT_MAX);
      }
      if (input.durationMs !== undefined) {
        record.durationMs = input.durationMs;
      }
      records.push(record);
      if (records.length > BUFFER_SIZE) {
        records.shift();
      }
    },
    snapshot: () => records.map((record) => ({ ...record })),
  };
}

export function installNetworkCapture(win: NetworkCaptureTarget, buffer: NetworkBuffer): void {
  if (!hasMark(win.fetch)) {
    const wrapped = wrapFetch(win.fetch, win, buffer);
    safely(() => {
      win.fetch = wrapped;
    });
  }
  if (!hasMark(win.XMLHttpRequest)) {
    wrapXhr(win.XMLHttpRequest.prototype, win, buffer);
  }
}
