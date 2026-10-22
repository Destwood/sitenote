import {
  CONSOLE_ERRORS_MAX,
  consoleErrorRecordSchema,
  type ConsoleErrorRecord,
} from "@sitenote/core";

import { ERRORS_REQUEST_TYPE, ERRORS_RESPONSE_TYPE, MESSAGE_SOURCE } from "../console-errors";

export const ERRORS_TIMEOUT_MS = 300;

export interface ErrorsBridgeOptions {
  win: Window;
  timeoutMs?: number;
  newNonce?: () => string;
}

function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
}

export function parseRecords(value: unknown): ConsoleErrorRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const records: ConsoleErrorRecord[] = [];
  for (const candidate of value.slice(-CONSOLE_ERRORS_MAX) as unknown[]) {
    const parsed = consoleErrorRecordSchema.safeParse(candidate);
    if (parsed.success) {
      records.push(parsed.data);
    }
  }
  return records;
}

export function requestConsoleErrors(options: ErrorsBridgeOptions): Promise<ConsoleErrorRecord[]> {
  const { win } = options;
  const newNonce = options.newNonce ?? (() => crypto.randomUUID());
  return new Promise((resolve) => {
    const nonce = newNonce();
    const timer = setTimeout(() => {
      finish([]);
    }, options.timeoutMs ?? ERRORS_TIMEOUT_MS);

    function finish(records: ConsoleErrorRecord[]): void {
      win.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(records);
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
      finish(parseRecords(field(data, "records")));
    }

    win.addEventListener("message", onMessage);
    try {
      win.postMessage(
        { source: MESSAGE_SOURCE, type: ERRORS_REQUEST_TYPE, nonce },
        win.location.origin,
      );
    } catch {
      finish([]);
    }
  });
}
