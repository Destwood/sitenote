import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSitenoteClient: vi.fn(),
  getPublicEnv: vi.fn(),
}));

vi.mock("@sitenote/db", () => ({ createSitenoteClient: mocks.createSitenoteClient }));
vi.mock("../env", () => ({ getPublicEnv: mocks.getPublicEnv }));

import { DEMO_STORAGE_KEY, getDemoSupabaseClient } from ".";

const CLIENT = { marker: "demo" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPublicEnv.mockReturnValue({
    supabaseUrl: "https://example.supabase.co",
    supabasePublishableKey: "publishable",
  });
  mocks.createSitenoteClient.mockReturnValue(CLIENT);
});

describe("getDemoSupabaseClient", () => {
  it("creates one client that stores its session under the demo key", () => {
    expect(getDemoSupabaseClient()).toBe(CLIENT);
    expect(getDemoSupabaseClient()).toBe(CLIENT);
    expect(DEMO_STORAGE_KEY).toBe("sitenote-demo");
    expect(mocks.createSitenoteClient).toHaveBeenCalledTimes(1);
    expect(mocks.createSitenoteClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "publishable",
      {
        auth: {
          storageKey: "sitenote-demo",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      },
    );
  });
});
