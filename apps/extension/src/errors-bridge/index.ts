import {
  CONSOLE_ERRORS_MAX,
  NETWORK_ERRORS_MAX,
  consoleErrorRecordSchema,
  networkErrorRecordSchema,
  type ConsoleErrorRecord,
  type NetworkErrorRecord,
} from "@sitenote/core";

import { ERRORS_REQUEST_TYPE, ERRORS_RESPONSE_TYPE, MESSAGE_SOURCE } from "../console-errors";

export const ERRORS_TIMEOUT_MS = 300;

export interface ErrorsBridgeOptions {
  win: Window;
  timeoutMs?: number;
  newNonce?: () => string;
}

export interface PageDiagnostics {
  consoleErrors: ConsoleErrorRecord[];
  networkErrors: NetworkErrorRecord[];
}

function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
}

function parseList<T>(
  value: unknown,
  max: number,
  parse: (candidate: unknown) => T | undefined,
): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const records: T[] = [];
  for (const candidate of value.slice(-max) as unknown[]) {
    const parsed = parse(candidate);
    if (parsed !== undefined) {
      records.push(parsed);
    }
  }
  return records;
}

export function parseRecords(value: unknown): ConsoleErrorRecord[] {
  return parseList(value, CONSOLE_ERRORS_MAX, (candidate) => {
    const parsed = consoleErrorRecordSchema.safeParse(candidate);
    return parsed.success ? parsed.data : undefined;
  });
}

export function parseNetworkRecords(value: unknown): NetworkErrorRecord[] {
  return parseList(value, NETWORK_ERRORS_MAX, (candidate) => {
    const parsed = networkErrorRecordSchema.safeParse(candidate);
    return parsed.success ? parsed.data : undefined;
  });
}

export function requestPageDiagnostics(options: ErrorsBridgeOptions): Promise<PageDiagnostics> {
  const { win } = options;
  const newNonce = options.newNonce ?? (() => crypto.randomUUID());
  return new Promise((resolve) => {
    const nonce = newNonce();
    const timer = setTimeout(() => {
      finish({ consoleErrors: [], networkErrors: [] });
    }, options.timeoutMs ?? ERRORS_TIMEOUT_MS);

    function finish(diagnostics: PageDiagnostics): void {
      win.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(diagnostics);
    }

    function onMessage(event: MessageEvent): void {
      const data: unknown = event.data;
      if (
        event.source !== win ||
        event.origin !== win.location.origin ||
        field(data, "source") !== MESSAGE_SOURCE ||
        field(data, "type") !== ERRORS_RESPONSE_TYPE ||
        field(data, "nonce") !== nonce
      ) {
        return;
      }
      finish({
        consoleErrors: parseRecords(field(data, "records")),
        networkErrors: parseNetworkRecords(field(data, "network")),
      });
    }

    win.addEventListener("message", onMessage);
    try {
      win.postMessage(
        { source: MESSAGE_SOURCE, type: ERRORS_REQUEST_TYPE, nonce },
        win.location.origin,
      );
    } catch {
      finish({ consoleErrors: [], networkErrors: [] });
    }
  });
}

export function requestConsoleErrors(options: ErrorsBridgeOptions): Promise<ConsoleErrorRecord[]> {
  return requestPageDiagnostics(options).then((diagnostics) => diagnostics.consoleErrors);
}
