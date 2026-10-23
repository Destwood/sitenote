import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: () => ({ update: mocks.update }) }),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));

import { setThreadStatus, type ThreadActionState } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "20000000-0000-4000-8000-000000000001";
const USER = { id: "u-1", email: "owner@sitenote.test", isAnonymous: false };
const INITIAL: ThreadActionState = { error: null };

function formOf(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }
  return form;
}

function updateReturns(result: unknown) {
  const chain: Record<string, unknown> = {
    eq: () => chain,
    select: () => Promise.resolve(result),
  };
  mocks.update.mockReturnValue(chain);
}

const VALID = { workspaceId: WORKSPACE_ID, threadId: THREAD_ID, status: "resolved" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue(USER);
  updateReturns({ data: [{ id: THREAD_ID }], error: null });
});

describe("setThreadStatus", () => {
  it("updates the status and revalidates the thread and the list", async () => {
    const state = await setThreadStatus(INITIAL, formOf(VALID));

    expect(state).toEqual({ error: null });
    expect(mocks.update).toHaveBeenCalledWith({ status: "resolved" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/app/w/${WORKSPACE_ID}/threads/${THREAD_ID}`,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/app/w/${WORKSPACE_ID}/threads`);
  });

  it("rejects a status other than open or resolved without touching the database", async () => {
    const state = await setThreadStatus(INITIAL, formOf({ ...VALID, status: "archived" }));

    expect(state.error).toBe("We could not update the thread. Reload the page and try again.");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects malformed ids", async () => {
    const state = await setThreadStatus(INITIAL, formOf({ ...VALID, threadId: "nope" }));

    expect(state.error).toBe("We could not update the thread. Reload the page and try again.");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("sends a visitor without a session to sign-in", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    await expect(setThreadStatus(INITIAL, formOf(VALID))).rejects.toThrow(
      `NEXT_REDIRECT /sign-in?next=${encodeURIComponent(`/app/w/${WORKSPACE_ID}/threads/${THREAD_ID}`)}`,
    );
  });

  it("reports the database error without revalidating", async () => {
    updateReturns({ data: null, error: { message: "down" } });

    const state = await setThreadStatus(INITIAL, formOf(VALID));

    expect(state.error).toBe("We could not update the thread. Try again.");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a thread the user may not change, when no row was updated", async () => {
    updateReturns({ data: [], error: null });

    const state = await setThreadStatus(INITIAL, formOf(VALID));

    expect(state.error).toBe("You cannot change the status of this thread.");
  });
});
