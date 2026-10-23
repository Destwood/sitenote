import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
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
  createSupabaseServerClient: () =>
    Promise.resolve({ from: () => ({ update: mocks.update, delete: mocks.remove }) }),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));

import { leaveWorkspace, removeMember, setMemberRole } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const MEMBER_ID = "40000000-0000-4000-8000-000000000001";
const INITIAL = { error: null };

function formOf(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }
  return form;
}

function writeReturns(mock: typeof mocks.update, result: unknown) {
  const chain: Record<string, unknown> = {
    eq: () => chain,
    select: () => Promise.resolve(result),
  };
  mock.mockReturnValue(chain);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue({ id: "u-1", email: null, isAnonymous: false });
  writeReturns(mocks.update, { data: [{ id: "m-1" }], error: null });
  writeReturns(mocks.remove, { data: [{ id: "m-1" }], error: null });
});

describe("setMemberRole", () => {
  it("updates the role of a member and revalidates the list", async () => {
    const state = await setMemberRole(
      INITIAL,
      formOf({ workspaceId: WORKSPACE_ID, userId: MEMBER_ID, role: "guest" }),
    );

    expect(state).toEqual({ error: null });
    expect(mocks.update).toHaveBeenCalledWith({ role: "guest" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/app/w/${WORKSPACE_ID}/members`);
  });

  it("refuses the owner role and any other unknown role", async () => {
    const state = await setMemberRole(
      INITIAL,
      formOf({ workspaceId: WORKSPACE_ID, userId: MEMBER_ID, role: "owner" }),
    );

    expect(state.error).toBe("We could not update the member. Reload the page and try again.");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("explains that only the owner may change members when no row was updated", async () => {
    writeReturns(mocks.update, { data: [], error: null });

    const state = await setMemberRole(
      INITIAL,
      formOf({ workspaceId: WORKSPACE_ID, userId: MEMBER_ID, role: "member" }),
    );

    expect(state.error).toBe("Only the workspace owner can change members.");
  });
});

describe("removeMember", () => {
  it("removes the member and revalidates the list", async () => {
    const state = await removeMember(
      INITIAL,
      formOf({ workspaceId: WORKSPACE_ID, userId: MEMBER_ID }),
    );

    expect(state).toEqual({ error: null });
    expect(mocks.remove).toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/app/w/${WORKSPACE_ID}/members`);
  });

  it("reports a failed delete", async () => {
    writeReturns(mocks.remove, { data: null, error: { message: "down" } });

    const state = await removeMember(
      INITIAL,
      formOf({ workspaceId: WORKSPACE_ID, userId: MEMBER_ID }),
    );

    expect(state.error).toBe("We could not update the member. Try again.");
  });
});

describe("leaveWorkspace", () => {
  it("removes the signed-in user and goes back to the workspace list", async () => {
    await expect(leaveWorkspace(INITIAL, formOf({ workspaceId: WORKSPACE_ID }))).rejects.toThrow(
      "NEXT_REDIRECT /app",
    );
    expect(mocks.remove).toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app");
  });

  it("refuses when nothing was removed, as for the owner", async () => {
    writeReturns(mocks.remove, { data: [], error: null });

    const state = await leaveWorkspace(INITIAL, formOf({ workspaceId: WORKSPACE_ID }));

    expect(state.error).toBe("You cannot leave this workspace.");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("rejects a malformed workspace id", async () => {
    const state = await leaveWorkspace(INITIAL, formOf({ workspaceId: "nope" }));

    expect(state.error).toBe("We could not update the member. Reload the page and try again.");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
