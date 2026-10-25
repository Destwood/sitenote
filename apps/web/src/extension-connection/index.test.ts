import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sendSessionToExtension: vi.fn(),
  forgetWebSession: vi.fn(),
}));

vi.mock("../supabase-browser", () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: mocks.getSession } }),
}));
vi.mock("../extension-bridge", () => ({ sendSessionToExtension: mocks.sendSessionToExtension }));
vi.mock("../web-session", () => ({ forgetWebSession: mocks.forgetWebSession }));

import { connectExtension, connectMemberExtension } from ".";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const SESSION = { access_token: "access", refresh_token: "refresh" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: SESSION } });
  mocks.sendSessionToExtension.mockResolvedValue({ status: "ok" });
  mocks.forgetWebSession.mockResolvedValue(true);
});

describe("connectExtension", () => {
  it("hands the current tokens over and drops the web copy", async () => {
    expect(await connectExtension(EXTENSION_ID)).toEqual({
      status: "connected",
      webCopyCleared: true,
    });
    expect(mocks.sendSessionToExtension).toHaveBeenCalledWith(EXTENSION_ID, {
      accessToken: "access",
      refreshToken: "refresh",
    });
    expect(mocks.forgetWebSession).toHaveBeenCalledOnce();
  });

  it("reports a web copy that could not be dropped", async () => {
    mocks.forgetWebSession.mockResolvedValue(false);

    expect(await connectExtension(EXTENSION_ID)).toEqual({
      status: "connected",
      webCopyCleared: false,
    });
  });

  it("reports a missing extension without dropping the web copy", async () => {
    mocks.sendSessionToExtension.mockResolvedValue({ status: "unavailable" });

    expect(await connectExtension(EXTENSION_ID)).toEqual({ status: "missing" });
    expect(mocks.forgetWebSession).not.toHaveBeenCalled();
  });

  it("reports an extension that is signed in as another account", async () => {
    mocks.sendSessionToExtension.mockResolvedValue({
      status: "rejected",
      code: "already_signed_in",
    });

    expect(await connectExtension(EXTENSION_ID)).toEqual({ status: "alreadySignedIn" });
    expect(mocks.forgetWebSession).not.toHaveBeenCalled();
  });

  it("fails on any other rejection", async () => {
    mocks.sendSessionToExtension.mockResolvedValue({
      status: "rejected",
      code: "session_rejected",
    });

    expect(await connectExtension(EXTENSION_ID)).toEqual({ status: "failed" });
  });

  it("fails without a session on the web", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    expect(await connectExtension(EXTENSION_ID)).toEqual({ status: "failed" });
    expect(mocks.sendSessionToExtension).not.toHaveBeenCalled();
  });

  it("fails when the browser client throws", async () => {
    mocks.getSession.mockRejectedValue(new Error("offline"));

    expect(await connectExtension(EXTENSION_ID)).toEqual({ status: "failed" });
  });
});

const MINTED = { accessToken: "minted-access", refreshToken: "minted-refresh" };

function sessionFetch(response: Response) {
  return vi.fn<typeof fetch>(() => Promise.resolve(response));
}

describe("connectMemberExtension", () => {
  it("hands the minted session over and keeps the web session", async () => {
    const fetcher = sessionFetch(Response.json(MINTED));

    expect(await connectMemberExtension(EXTENSION_ID, fetcher)).toEqual({
      status: "connected",
      webCopyCleared: true,
    });
    expect(fetcher).toHaveBeenCalledWith("/extension/connect/session", {
      method: "POST",
      credentials: "same-origin",
    });
    expect(mocks.sendSessionToExtension).toHaveBeenCalledWith(EXTENSION_ID, {
      accessToken: "minted-access",
      refreshToken: "minted-refresh",
    });
    expect(mocks.forgetWebSession).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("fails when the session endpoint refuses", async () => {
    expect(
      await connectMemberExtension(EXTENSION_ID, sessionFetch(new Response(null, { status: 502 }))),
    ).toEqual({
      status: "failed",
    });
    expect(mocks.sendSessionToExtension).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty access token", { accessToken: "", refreshToken: "refresh" }],
    ["a missing refresh token", { accessToken: "access" }],
    ["a body that is not JSON", "not json"],
  ])("fails on %s", async (_label, body) => {
    const response = typeof body === "string" ? new Response(body) : Response.json(body);

    expect(await connectMemberExtension(EXTENSION_ID, sessionFetch(response))).toEqual({
      status: "failed",
    });
    expect(mocks.sendSessionToExtension).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "unavailable" }, { status: "missing" }],
    [{ status: "rejected", code: "already_signed_in" }, { status: "alreadySignedIn" }],
    [{ status: "rejected", code: "session_rejected" }, { status: "failed" }],
  ])("maps the extension result %o", async (result, expected) => {
    mocks.sendSessionToExtension.mockResolvedValue(result);

    expect(await connectMemberExtension(EXTENSION_ID, sessionFetch(Response.json(MINTED)))).toEqual(
      expected,
    );
    expect(mocks.forgetWebSession).not.toHaveBeenCalled();
  });

  it("fails when the network throws", async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("offline")));

    expect(await connectMemberExtension(EXTENSION_ID, fetcher)).toEqual({ status: "failed" });
  });
});
