import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PING_TIMEOUT_MS, SESSION_TIMEOUT_MS, pingExtension, sendSessionToExtension } from ".";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const TOKENS = { accessToken: "access", refreshToken: "refresh" };

type Callback = (response: unknown) => void;

function installRuntime(handler: (message: unknown, callback: Callback) => void) {
  const sendMessage = vi.fn((_id: string, message: unknown, callback: Callback) => {
    handler(message, callback);
  });
  vi.stubGlobal("chrome", { runtime: { sendMessage } });
  return sendMessage;
}

function typeOf(message: unknown): unknown {
  return typeof message === "object" && message !== null ? Reflect.get(message, "type") : null;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("pingExtension", () => {
  it("is unavailable when the page has no chrome runtime", async () => {
    vi.stubGlobal("chrome", undefined);

    expect(await pingExtension(EXTENSION_ID)).toEqual({ status: "unavailable" });
  });

  it("is unavailable when the runtime cannot send messages", async () => {
    vi.stubGlobal("chrome", { runtime: {} });

    expect(await pingExtension(EXTENSION_ID)).toEqual({ status: "unavailable" });
  });

  it("is ok when the extension answers", async () => {
    const send = installRuntime((_message, callback) => {
      callback({ ok: true, data: null });
    });

    expect(await pingExtension(EXTENSION_ID)).toEqual({ status: "ok" });
    expect(send).toHaveBeenCalledWith(
      EXTENSION_ID,
      { type: "external.ping" },
      expect.any(Function),
    );
  });

  it("is unavailable when the extension does not answer", async () => {
    installRuntime((_message, callback) => {
      callback(undefined);
    });

    expect(await pingExtension(EXTENSION_ID)).toEqual({ status: "unavailable" });
  });

  it("is unavailable when the answer has an unknown shape", async () => {
    installRuntime((_message, callback) => {
      callback({ hello: "world" });
    });

    expect(await pingExtension(EXTENSION_ID)).toEqual({ status: "unavailable" });
  });

  it("is unavailable when sending throws", async () => {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: () => {
          throw new Error("Invalid extension id");
        },
      },
    });

    expect(await pingExtension(EXTENSION_ID)).toEqual({ status: "unavailable" });
  });

  it("gives up after the timeout when the callback never fires", async () => {
    installRuntime(() => undefined);

    const pending = pingExtension(EXTENSION_ID);
    await vi.advanceTimersByTimeAsync(PING_TIMEOUT_MS);

    expect(await pending).toEqual({ status: "unavailable" });
  });

  it("reads lastError inside the callback so the browser does not log it", async () => {
    const lastError = vi.fn(() => ({ message: "Could not establish connection." }));
    const runtime = {
      sendMessage: (_id: string, _message: unknown, callback: Callback) => {
        callback(undefined);
      },
      get lastError() {
        return lastError();
      },
    };
    vi.stubGlobal("chrome", { runtime });

    await pingExtension(EXTENSION_ID);

    expect(lastError).toHaveBeenCalled();
  });
});

describe("sendSessionToExtension", () => {
  it("pings first and then sends the tokens", async () => {
    const send = installRuntime((_message, callback) => {
      callback({ ok: true, data: null });
    });

    expect(await sendSessionToExtension(EXTENSION_ID, TOKENS)).toEqual({ status: "ok" });

    expect(send.mock.calls.map(([, message]) => typeOf(message))).toEqual([
      "external.ping",
      "external.session",
    ]);
    expect(send).toHaveBeenLastCalledWith(
      EXTENSION_ID,
      { type: "external.session", accessToken: "access", refreshToken: "refresh" },
      expect.any(Function),
    );
  });

  it("does not send the tokens when the extension is missing", async () => {
    const send = installRuntime((_message, callback) => {
      callback(undefined);
    });

    expect(await sendSessionToExtension(EXTENSION_ID, TOKENS)).toEqual({ status: "unavailable" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("returns the rejection code of the extension", async () => {
    installRuntime((message, callback) => {
      callback(
        typeOf(message) === "external.ping"
          ? { ok: true, data: null }
          : { ok: false, error: { code: "already_signed_in", message: "x" } },
      );
    });

    expect(await sendSessionToExtension(EXTENSION_ID, TOKENS)).toEqual({
      status: "rejected",
      code: "already_signed_in",
    });
  });

  it("is unavailable when the extension stops answering after the ping", async () => {
    installRuntime((message, callback) => {
      if (typeOf(message) === "external.ping") {
        callback({ ok: true, data: null });
      }
    });

    const pending = sendSessionToExtension(EXTENSION_ID, TOKENS);
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS);

    expect(await pending).toEqual({ status: "unavailable" });
  });
});
