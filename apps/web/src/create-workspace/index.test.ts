import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  from: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: mocks.from }),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));

import { createWorkspace } from ".";

const IDLE = { error: null, name: "" };
const USER = { id: "user-1", email: "owner@sitenote.test", isAnonymous: false };

function form(name: string): FormData {
  const data = new FormData();
  data.set("name", name);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.getAuthenticatedUser.mockResolvedValue(USER);
});

describe("createWorkspace", () => {
  it("inserts a trimmed name owned by the signed-in user and revalidates the dashboard", async () => {
    const state = await createWorkspace(IDLE, form("  Acme  "));

    expect(mocks.from).toHaveBeenCalledWith("workspaces");
    expect(mocks.insert).toHaveBeenCalledWith({ name: "Acme", owner_id: "user-1" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app");
    expect(state).toEqual({ error: null, name: "" });
  });

  it("rejects an empty name without touching the database", async () => {
    const state = await createWorkspace(IDLE, form("   "));

    expect(state.error).toContain("1 to 80");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a name longer than 80 characters and keeps the typed value", async () => {
    const long = "a".repeat(81);
    const state = await createWorkspace(IDLE, form(long));

    expect(state.error).toContain("1 to 80");
    expect(state.name).toBe(long);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects a missing field", async () => {
    const state = await createWorkspace(IDLE, new FormData());

    expect(state.error).not.toBeNull();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("redirects visitors without a session to sign-in", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    await expect(createWorkspace(IDLE, form("Acme"))).rejects.toThrow(
      "NEXT_REDIRECT /sign-in?next=/app",
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("refuses guests", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ ...USER, isAnonymous: true });

    const state = await createWorkspace(IDLE, form("Acme"));

    expect(state.error).toBe("Guests cannot create workspaces.");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("reports a database failure with a generic message", async () => {
    mocks.insert.mockResolvedValue({ error: { message: "secret detail", code: "42501" } });

    const state = await createWorkspace(IDLE, form("Acme"));

    expect(state.error).toBe("We could not create the workspace. Try again.");
    expect(state.name).toBe("Acme");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
