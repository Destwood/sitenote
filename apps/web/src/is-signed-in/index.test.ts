import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("../supabase-server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));

import { isSignedIn } from ".";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSupabaseServerClient.mockResolvedValue({ client: true });
});

describe("isSignedIn", () => {
  it("is true for a member", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({
      id: "u-1",
      email: "a@example.com",
      isAnonymous: false,
    });
    expect(await isSignedIn()).toBe(true);
    expect(mocks.getAuthenticatedUser).toHaveBeenCalledWith({ client: true });
  });

  it("is false without a session", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);
    expect(await isSignedIn()).toBe(false);
  });

  it("is false for a guest session", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "u-2", email: null, isAnonymous: true });
    expect(await isSignedIn()).toBe(false);
  });

  it("is false when reading the session fails", async () => {
    mocks.getAuthenticatedUser.mockRejectedValue(new Error("auth unavailable"));
    expect(await isSignedIn()).toBe(false);
  });
});
