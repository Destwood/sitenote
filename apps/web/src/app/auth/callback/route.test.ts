import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("../../../supabase-server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: { exchangeCodeForSession: mocks.exchangeCodeForSession, verifyOtp: mocks.verifyOtp },
    }),
}));

import { GET } from "./route";

function call(query: string) {
  return GET(new NextRequest(`http://localhost:3000/auth/callback${query}`));
}

function location(response: Response): string | null {
  const header = response.headers.get("location");
  return header === null ? null : new URL(header).pathname + new URL(header).search;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({ error: null });
});

describe("GET /auth/callback", () => {
  it("exchanges the code and redirects to the requested path", async () => {
    const response = await call("?code=abc&next=%2Fapp%2Fsettings");

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.status).toBe(303);
    expect(location(response)).toBe("/app/settings");
  });

  it("defaults to the dashboard when next is missing", async () => {
    const response = await call("?code=abc");

    expect(location(response)).toBe("/app");
  });

  it.each(["//evil.example", "https://evil.example", "/\\evil.example", "%2F%2Fevil.example"])(
    "ignores the unsafe next value %s",
    async (next) => {
      const response = await call(`?code=abc&next=${encodeURIComponent(next)}`);

      expect(response.headers.get("location")).toBe("http://localhost:3000/app");
    },
  );

  it("redirects to sign-in with a whitelisted key when the exchange fails", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { message: "PKCE code verifier not found in storage" },
    });

    const response = await call("?code=abc&next=%2Fapp");

    expect(location(response)).toBe("/sign-in?error=exchange_failed");
  });

  it("redirects to sign-in when the code is missing or empty", async () => {
    expect(location(await call(""))).toBe("/sign-in?error=missing_code");
    expect(location(await call("?code="))).toBe("/sign-in?error=missing_code");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it.each(["magiclink", "email"])(
    "verifies a %s token hash and redirects to the requested path",
    async (type) => {
      const response = await call(`?token_hash=hash-1&type=${type}&next=%2Fextension%2Fconnect`);

      expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash-1", type });
      expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(location(response)).toBe("/extension/connect");
    },
  );

  it("redirects to sign-in when the token hash cannot be verified", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { message: "Token has expired" } });

    const response = await call("?token_hash=hash-1&type=magiclink&next=%2Fapp");

    expect(location(response)).toBe("/sign-in?error=exchange_failed");
  });

  it.each(["", "&type=recovery", "&type=signup", "&type=bogus"])(
    "refuses a token hash with an unsupported type (%s)",
    async (suffix) => {
      const response = await call(`?token_hash=hash-1${suffix}`);

      expect(location(response)).toBe("/sign-in?error=exchange_failed");
      expect(mocks.verifyOtp).not.toHaveBeenCalled();
    },
  );

  it("maps a provider error to a fixed key and never echoes the description", async () => {
    const response = await call(
      "?error=access_denied&error_description=%3Cscript%3Ealert(1)%3C%2Fscript%3E&code=abc",
    );

    expect(location(response)).toBe("/sign-in?error=access_denied");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
