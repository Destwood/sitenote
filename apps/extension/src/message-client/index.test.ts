import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success } from "../messages";
import { onAuthStateChanged, sendMessage } from ".";

type Listener = (message: unknown, sender: { id?: string | undefined }) => undefined;

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  listeners: new Set<unknown>(),
}));

vi.mock("wxt/browser", () => ({
  browser: {
    runtime: {
      id: "own-extension-id",
      sendMessage: mocks.sendMessage,
      onMessage: {
        addListener: (listener: unknown) => mocks.listeners.add(listener),
        removeListener: (listener: unknown) => mocks.listeners.delete(listener),
      },
    },
  },
}));

const SIGNED_IN = {
  status: "signedIn",
  user: { id: "u", email: "a@b.test", displayName: "Ann", isAnonymous: false },
} as const;

function emit(message: unknown, sender: { id?: string | undefined }) {
  for (const listener of mocks.listeners) {
    (listener as Listener)(message, sender);
  }
}

beforeEach(() => {
  mocks.sendMessage.mockReset();
  mocks.listeners.clear();
});

describe("sendMessage", () => {
  it("sends the request and returns the validated response", async () => {
    mocks.sendMessage.mockResolvedValue(success(SIGNED_IN));

    const response = await sendMessage({ type: "auth.getState" });

    expect(mocks.sendMessage).toHaveBeenCalledWith({ type: "auth.getState" });
    expect(response).toEqual(success(SIGNED_IN));
  });

  it("passes an error response through", async () => {
    mocks.sendMessage.mockResolvedValue(failure("rate_limited"));

    expect(await sendMessage({ type: "auth.sendCode", email: "a@b.test" })).toEqual(
      failure("rate_limited"),
    );
  });

  it("reports the background as unavailable when nothing answers", async () => {
    mocks.sendMessage.mockResolvedValue(undefined);

    expect(await sendMessage({ type: "auth.getState" })).toEqual(failure("unavailable"));
  });

  it("reports the background as unavailable when the response has the wrong shape", async () => {
    mocks.sendMessage.mockResolvedValue(success({ status: "pending" }));

    expect(await sendMessage({ type: "auth.getState" })).toEqual(failure("unavailable"));
  });

  it("reports the background as unavailable when sending throws", async () => {
    mocks.sendMessage.mockRejectedValue(new Error("Could not establish connection."));

    expect(await sendMessage({ type: "auth.signOut" })).toEqual(failure("unavailable"));
  });
});

describe("onAuthStateChanged", () => {
  it("delivers a state broadcast from this extension", () => {
    const listener = vi.fn();
    onAuthStateChanged(listener);

    emit({ type: "auth.stateChanged", state: SIGNED_IN }, { id: "own-extension-id" });

    expect(listener).toHaveBeenCalledExactlyOnceWith(SIGNED_IN);
  });

  it("ignores a broadcast from another sender", () => {
    const listener = vi.fn();
    onAuthStateChanged(listener);

    emit({ type: "auth.stateChanged", state: SIGNED_IN }, { id: "other-extension-id" });
    emit({ type: "auth.stateChanged", state: SIGNED_IN }, {});

    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores messages that are not valid broadcasts", () => {
    const listener = vi.fn();
    onAuthStateChanged(listener);

    emit({ type: "auth.stateChanged", state: { status: "x" } }, { id: "own-extension-id" });
    emit({ type: "auth.getState" }, { id: "own-extension-id" });
    emit("auth.stateChanged", { id: "own-extension-id" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribing", () => {
    const listener = vi.fn();
    const unsubscribe = onAuthStateChanged(listener);

    unsubscribe();
    emit({ type: "auth.stateChanged", state: SIGNED_IN }, { id: "own-extension-id" });

    expect(listener).not.toHaveBeenCalled();
    expect(mocks.listeners.size).toBe(0);
  });
});
