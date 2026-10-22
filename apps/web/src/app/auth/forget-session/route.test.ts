import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  remove: vi.fn<(name: string) => void>(),
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ getAll: mocks.getAll, delete: mocks.remove }),
}));
vi.mock("../../../env", () => ({
  getPublicEnv: () => ({ webUrl: "http://localhost:3000" }),
}));

import { POST } from "./route";

function post(origin: string | null): NextRequest {
  const request = new NextRequest("http://localhost:3000/auth/forget-session", { method: "POST" });
  Object.defineProperty(request, "headers", {
    value: new Headers(origin === null ? {} : { origin }),
  });
  return request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAll.mockReturnValue([
    { name: "sb-local-auth-token.0", value: "a" },
    { name: "sb-local-auth-token.1", value: "b" },
    { name: "sb-local-auth-token-code-verifier", value: "c" },
    { name: "theme", value: "dark" },
  ]);
});

describe("POST /auth/forget-session", () => {
  it("deletes every Supabase auth cookie and nothing else", async () => {
    const response = await POST(post("http://localhost:3000"));

    expect(response.status).toBe(204);
    expect(mocks.remove.mock.calls.map(([name]) => name)).toEqual([
      "sb-local-auth-token.0",
      "sb-local-auth-token.1",
      "sb-local-auth-token-code-verifier",
    ]);
  });

  it.each([["http://evil.example"], ["http://localhost:3001"], ["null"], [null]])(
    "refuses the origin %s and keeps the cookies",
    async (origin) => {
      const response = await POST(post(origin));

      expect(response.status).toBe(403);
      expect(mocks.remove).not.toHaveBeenCalled();
    },
  );
});
