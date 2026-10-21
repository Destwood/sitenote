import { describe, expect, it, vi } from "vitest";

import { failure, success } from "../messages";
import type { RouterSender } from "../message-router";
import type { SessionHandoff } from "../session-handoff";
import { createExternalRouter } from ".";

const WEB_ORIGIN = "https://app.sitenote.test";
const FROM_WEB: RouterSender = { url: `${WEB_ORIGIN}/invite/abc`, tab: { id: 3 } };
const SESSION = { type: "external.session", accessToken: "a", refreshToken: "r" };

function setup() {
  const accept = vi.fn<SessionHandoff["accept"]>(() => Promise.resolve(success(null)));
  const route = createExternalRouter({ webOrigin: WEB_ORIGIN, handoff: { accept } });
  return { route, accept };
}

describe("sender origin", () => {
  it.each([
    ["another origin", { url: "https://evil.test/invite/abc" }],
    ["a look-alike host", { url: "https://app.sitenote.test.evil.test/" }],
    ["another port", { url: "https://app.sitenote.test:8443/" }],
    ["another scheme", { url: "http://app.sitenote.test/" }],
    ["an extension page", { id: "other", url: "chrome-extension://other/popup.html" }],
    ["no url", {}],
    ["an unparsable url", { url: "not a url" }],
  ])("rejects a message from %s", async (_label, sender) => {
    const { route, accept } = setup();

    expect(await route({ type: "external.ping" }, sender)).toMatchObject({
      ok: false,
      error: { code: "forbidden_sender" },
    });
    expect(await route(SESSION, sender)).toMatchObject({
      ok: false,
      error: { code: "forbidden_sender" },
    });
    expect(accept).not.toHaveBeenCalled();
  });
});

describe("requests", () => {
  it("answers a ping from the web origin", async () => {
    const { route } = setup();

    expect(await route({ type: "external.ping" }, FROM_WEB)).toEqual({ ok: true, data: null });
  });

  it("hands the tokens of a session message to the handoff", async () => {
    const { route, accept } = setup();

    const result = await route(SESSION, FROM_WEB);

    expect(result).toEqual({ ok: true, data: null });
    expect(accept).toHaveBeenCalledWith({ accessToken: "a", refreshToken: "r" });
  });

  it("passes the handoff failure through", async () => {
    const { route, accept } = setup();
    accept.mockResolvedValueOnce(failure("already_signed_in"));

    expect(await route(SESSION, FROM_WEB)).toMatchObject({
      ok: false,
      error: { code: "already_signed_in" },
    });
  });

  it.each([
    ["a missing message", undefined],
    ["a string", "external.ping"],
    ["an unknown type", { type: "auth.getState" }],
    ["a regular extension request", { type: "workspaces.list" }],
    ["a session without tokens", { type: "external.session" }],
    ["a session with an empty access token", { ...SESSION, accessToken: "" }],
    ["a session with a numeric refresh token", { ...SESSION, refreshToken: 1 }],
    ["a session with an oversized token", { ...SESSION, accessToken: "x".repeat(8193) }],
  ])("rejects %s as an invalid request", async (_label, message) => {
    const { route, accept } = setup();

    expect(await route(message, FROM_WEB)).toMatchObject({
      ok: false,
      error: { code: "invalid_request" },
    });
    expect(accept).not.toHaveBeenCalled();
  });

  it("ignores extra fields on a ping", async () => {
    const { route } = setup();

    expect(await route({ type: "external.ping", extra: true }, FROM_WEB)).toEqual({
      ok: true,
      data: null,
    });
  });
});
