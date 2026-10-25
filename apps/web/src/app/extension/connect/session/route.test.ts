import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  mintExtensionSession: vi.fn(),
}));

vi.mock("../../../../env", () => ({
  getPublicEnv: () => ({
    webUrl: "http://localhost:3000",
    supabaseUrl: "http://127.0.0.1:54321",
    supabasePublishableKey: "sb_publishable_key",
  }),
}));
vi.mock("../../../../server-env", () => ({
  getServerEnv: () => ({ secretKey: "sb_secret_key" }),
}));
vi.mock("../../../../supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({}),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));
vi.mock("../../../../extension-session", () => ({
  mintExtensionSession: mocks.mintExtensionSession,
}));
vi.mock("@sitenote/db", () => ({ createSitenoteClient: () => ({}) }));

import { POST } from "./route";

function post(origin: string | null): NextRequest {
  const request = new NextRequest("http://localhost:3000/extension/connect/session", {
    method: "POST",
  });
  Object.defineProperty(request, "headers", {
    value: new Headers(origin === null ? {} : { origin }),
  });
  return request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue({
    id: "u-2",
    email: "ada@example.com",
    isAnonymous: false,
  });
  mocks.mintExtensionSession.mockResolvedValue({ accessToken: "access", refreshToken: "refresh" });
});

describe("POST /extension/connect/session", () => {
  it.each([["http://evil.example"], ["http://localhost:3001"], ["null"], [null]])(
    "refuses the origin %s",
    async (origin) => {
      const response = await POST(post(origin));

      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(mocks.mintExtensionSession).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["no user", null],
    ["a guest", { id: "u-1", email: null, isAnonymous: true }],
    ["a user without e-mail", { id: "u-3", email: null, isAnonymous: false }],
  ])("refuses %s with 401", async (_label, user) => {
    mocks.getAuthenticatedUser.mockResolvedValue(user);

    const response = await POST(post("http://localhost:3000"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.mintExtensionSession).not.toHaveBeenCalled();
  });

  it("answers 502 when no session can be minted", async () => {
    mocks.mintExtensionSession.mockResolvedValue(null);

    const response = await POST(post("http://localhost:3000"));

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns the minted tokens for the signed-in member", async () => {
    const response = await POST(post("http://localhost:3000"));

    expect(mocks.mintExtensionSession).toHaveBeenCalledWith("ada@example.com", expect.anything());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ accessToken: "access", refreshToken: "refresh" });
  });
});
