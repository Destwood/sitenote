import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: () => ({ delete: mocks.remove }) }),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));

import { removeSite } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const SITE_ID = "30000000-0000-4000-8000-000000000001";
const INITIAL = { error: null };

function formOf(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }
  return form;
}

function deleteReturns(result: unknown) {
  const chain: Record<string, unknown> = {
    eq: () => chain,
    select: () => Promise.resolve(result),
  };
  mocks.remove.mockReturnValue(chain);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue({ id: "u-1", email: null, isAnonymous: false });
  deleteReturns({ data: [{ id: SITE_ID }], error: null });
});

describe("removeSite", () => {
  it("removes the site and revalidates the sites and threads lists", async () => {
    const state = await removeSite(INITIAL, formOf({ workspaceId: WORKSPACE_ID, siteId: SITE_ID }));

    expect(state).toEqual({ error: null });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/app/w/${WORKSPACE_ID}/sites`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/app/w/${WORKSPACE_ID}/threads`);
  });

  it("rejects malformed ids without touching the database", async () => {
    const state = await removeSite(INITIAL, formOf({ workspaceId: WORKSPACE_ID, siteId: "nope" }));

    expect(state.error).toBe("We could not remove the site. Reload the page and try again.");
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("sends a visitor without a session to sign-in", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    await expect(
      removeSite(INITIAL, formOf({ workspaceId: WORKSPACE_ID, siteId: SITE_ID })),
    ).rejects.toThrow(
      `NEXT_REDIRECT /sign-in?next=${encodeURIComponent(`/app/w/${WORKSPACE_ID}/sites`)}`,
    );
  });

  it("explains that only the owner may remove a site when no row was deleted", async () => {
    deleteReturns({ data: [], error: null });

    const state = await removeSite(INITIAL, formOf({ workspaceId: WORKSPACE_ID, siteId: SITE_ID }));

    expect(state.error).toBe("Only the workspace owner can remove a site.");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a failed delete", async () => {
    deleteReturns({ data: null, error: { message: "down" } });

    const state = await removeSite(INITIAL, formOf({ workspaceId: WORKSPACE_ID, siteId: SITE_ID }));

    expect(state.error).toBe("We could not remove the site. Try again.");
  });
});
