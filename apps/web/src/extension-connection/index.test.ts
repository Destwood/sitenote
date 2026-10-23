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

import { connectExtension } from ".";

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
