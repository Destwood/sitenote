import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("../../../supabase-server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({ auth: { exchangeCodeForSession: mocks.exchangeCodeForSession } }),
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

  it("maps a provider error to a fixed key and never echoes the description", async () => {
    const response = await call(
      "?error=access_denied&error_description=%3Cscript%3Ealert(1)%3C%2Fscript%3E&code=abc",
    );

    expect(location(response)).toBe("/sign-in?error=access_denied");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
