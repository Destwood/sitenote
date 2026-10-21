import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(() => Promise.resolve({ error: null })),
}));

vi.mock("../../../supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ auth: { signOut: mocks.signOut } }),
}));

import { POST } from "./route";

describe("POST /auth/sign-out", () => {
  it("ends only this browser session and redirects to the landing page", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/auth/sign-out", { method: "POST" }),
    );

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });
});
