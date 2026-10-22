import * as z from "zod/mini";

export const PING_TIMEOUT_MS = 2500;
export const SESSION_TIMEOUT_MS = 15000;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export type ExtensionResult =
  { status: "ok" } | { status: "unavailable" } | { status: "rejected"; code: string };

type Callback = (response: unknown) => void;
type SendMessage = (extensionId: string, message: unknown, callback: Callback) => void;

const responseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string() }) }),
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function findSendMessage(): SendMessage | null {
  const chromeGlobal: unknown = Reflect.get(globalThis, "chrome");
  const runtime = isRecord(chromeGlobal) ? chromeGlobal.runtime : undefined;
  if (!isRecord(runtime)) {
    return null;
  }
  const send: unknown = runtime.sendMessage;
  if (typeof send !== "function") {
    return null;
  }
  return (extensionId, message, callback) => {
    Reflect.apply(send, runtime, [
      extensionId,
      message,
      (response: unknown) => {
        Reflect.get(runtime, "lastError");
        callback(response);
      },
    ]);
  };
}

function request(
  extensionId: string,
  message: unknown,
  timeoutMs: number,
): Promise<ExtensionResult> {
  const send = findSendMessage();
  if (send === null) {
    return Promise.resolve({ status: "unavailable" });
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ status: "unavailable" });
    }, timeoutMs);
    const settle = (result: ExtensionResult) => {
      clearTimeout(timer);
      resolve(result);
    };
    try {
      send(extensionId, message, (response) => {
        const parsed = responseSchema.safeParse(response);
        if (!parsed.success) {
          settle({ status: "unavailable" });
        } else {
          settle(
            parsed.data.ok
              ? { status: "ok" }
              : { status: "rejected", code: parsed.data.error.code },
          );
        }
      });
    } catch {
      settle({ status: "unavailable" });
    }
  });
}

export function pingExtension(extensionId: string): Promise<ExtensionResult> {
  return request(extensionId, { type: "external.ping" }, PING_TIMEOUT_MS);
}

export async function sendSessionToExtension(
  extensionId: string,
  tokens: SessionTokens,
): Promise<ExtensionResult> {
  const ping = await pingExtension(extensionId);
  if (ping.status !== "ok") {
    return ping;
  }
  return request(extensionId, { type: "external.session", ...tokens }, SESSION_TIMEOUT_MS);
}
