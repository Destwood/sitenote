import { describe, expect, it, vi } from "vitest";

import type { AuthService } from "../auth-service";
import { failure, success, type AuthState } from "../messages";
import { createMessageRouter } from ".";

const EXTENSION_ID = "anefihllkbkenhjbjggfndgemgkfaeoa";
const SIGNED_OUT: AuthState = { status: "signedOut" };

function createFakeService() {
  const calls: string[] = [];
  const service: AuthService = {
    keepFresh: vi.fn(),
    describeSession: vi.fn(),
    getState: vi.fn(() => {
      calls.push("getState");
      return Promise.resolve(success(SIGNED_OUT));
    }),
    sendCode: vi.fn((email: string) => {
      calls.push(`sendCode:${email}`);
      return Promise.resolve(success(null));
    }),
    verifyCode: vi.fn((email: string, code: string) => {
      calls.push(`verifyCode:${email}:${code}`);
      return Promise.resolve(success(SIGNED_OUT));
    }),
    signInWithGoogle: vi.fn(() => {
      calls.push("signInWithGoogle");
      return Promise.resolve(failure("google_disabled"));
    }),
    signOut: vi.fn(() => {
      calls.push("signOut");
      return Promise.resolve(success(SIGNED_OUT));
    }),
  };
  return { service, calls };
}

function setup(onWake: () => Promise<void> = () => Promise.resolve()) {
  const { service, calls } = createFakeService();
  const wake = vi.fn(onWake);
  const route = createMessageRouter({ extensionId: EXTENSION_ID, service, onWake: wake });
  return { route, calls, wake };
}

const OWN = { id: EXTENSION_ID };

describe("createMessageRouter", () => {
  it.each([
    ["a missing sender id", {}],
    ["another extension", { id: "pnmlpmcmdnkjhkdfmcnpbkalfmnkgnoj" }],
  ])("rejects a message from %s before touching the service", async (_name, sender) => {
    const { route, calls, wake } = setup();

    const response = await route({ type: "auth.getState" }, sender);

    expect(response).toEqual(failure("forbidden_sender"));
    expect(calls).toEqual([]);
    expect(wake).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown type", { type: "auth.deleteEverything" }],
    ["a missing email", { type: "auth.sendCode" }],
    ["a malformed code", { type: "auth.verifyCode", email: "a@b.test", code: "12" }],
    ["a broadcast sent as a request", { type: "auth.stateChanged", state: SIGNED_OUT }],
    ["a string", "auth.getState"],
    ["undefined", undefined],
  ])("rejects %s as an invalid request", async (_name, message) => {
    const { route, calls, wake } = setup();

    const response = await route(message, OWN);

    expect(response).toEqual(failure("invalid_request"));
    expect(calls).toEqual([]);
    expect(wake).not.toHaveBeenCalled();
  });

  it("routes each request to its service method", async () => {
    const { route, calls } = setup();

    await route({ type: "auth.getState" }, OWN);
    await route({ type: "auth.sendCode", email: " a@b.test " }, OWN);
    await route({ type: "auth.verifyCode", email: "a@b.test", code: "123456" }, OWN);
    await route({ type: "auth.signInWithGoogle" }, OWN);
    await route({ type: "auth.signOut" }, OWN);

    expect(calls).toEqual([
      "getState",
      "sendCode:a@b.test",
      "verifyCode:a@b.test:123456",
      "signInWithGoogle",
      "signOut",
    ]);
  });

  it("returns the service response unchanged", async () => {
    const { route } = setup();

    expect(await route({ type: "auth.signInWithGoogle" }, OWN)).toEqual(failure("google_disabled"));
    expect(await route({ type: "auth.sendCode", email: "a@b.test" }, OWN)).toEqual(success(null));
  });

  it("makes sure the session is current before handling a valid message", async () => {
    const order: string[] = [];
    const { service } = createFakeService();
    vi.mocked(service.getState).mockImplementation(() => {
      order.push("handler");
      return Promise.resolve(success(SIGNED_OUT));
    });
    const route = createMessageRouter({
      extensionId: EXTENSION_ID,
      service,
      onWake: () => {
        order.push("wake");
        return Promise.resolve();
      },
    });

    await route({ type: "auth.getState" }, OWN);

    expect(order).toEqual(["wake", "handler"]);
  });

  it("still handles the message when the wake-up refresh fails", async () => {
    const { route, calls } = setup(() => Promise.reject(new Error("offline")));

    const response = await route({ type: "auth.getState" }, OWN);

    expect(response).toEqual(success(SIGNED_OUT));
    expect(calls).toEqual(["getState"]);
  });
});
