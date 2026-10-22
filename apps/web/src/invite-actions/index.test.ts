import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  is: vi.fn(),
  eqWorkspace: vi.fn(),
  eqInvite: vi.fn(),
  update: vi.fn<(values: { revoked_at: string }) => unknown>(),
  getAuthenticatedUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ rpc: mocks.rpc, from: mocks.from }),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));

import { acceptInvite, createInvite, revokeInvite } from ".";

const IDLE = { error: null };
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const INVITE_ID = "50000000-0000-4000-8000-000000000001";
const TOKEN = "a".repeat(48);
const USER = { id: "user-1", email: "owner@sitenote.test", isAnonymous: false };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue(USER);
  mocks.rpc.mockResolvedValue({ data: {}, error: null });
  mocks.from.mockReturnValue({ update: mocks.update });
  mocks.update.mockReturnValue({ eq: mocks.eqInvite });
  mocks.eqInvite.mockReturnValue({ eq: mocks.eqWorkspace });
  mocks.eqWorkspace.mockReturnValue({ is: mocks.is });
  mocks.is.mockReturnValue({ select: mocks.select });
  mocks.select.mockResolvedValue({ data: [{ id: INVITE_ID }], error: null });
});

describe("createInvite", () => {
  const valid = { workspaceId: WORKSPACE_ID, role: "guest", expiresInDays: "7" };

  it("creates the invite through create_invite with the chosen role and expiry", async () => {
    const state = await createInvite(IDLE, form(valid));

    expect(mocks.rpc).toHaveBeenCalledWith("create_invite", {
      p_workspace_id: WORKSPACE_ID,
      p_role: "guest",
      p_expires_in: "7 days",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/app/w/${WORKSPACE_ID}/invites`);
    expect(state).toEqual({ error: null });
  });

  it.each([
    ["1", "1 day"],
    ["30", "30 days"],
  ])("accepts %s days", async (days) => {
    await createInvite(IDLE, form({ ...valid, expiresInDays: days }));

    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_invite",
      expect.objectContaining({ p_expires_in: `${days} days` }),
    );
  });

  it.each([
    ["an owner role", { role: "owner" }],
    ["a missing role", { role: "" }],
    ["an unlisted expiry", { expiresInDays: "365" }],
    ["a negative expiry", { expiresInDays: "-1" }],
    ["a malformed workspace id", { workspaceId: "nope" }],
  ])("rejects %s without calling the database", async (_label, override) => {
    const state = await createInvite(IDLE, form({ ...valid, ...override }));

    expect(state.error).toContain("Choose a role and an expiry");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("redirects visitors without a session to sign-in and back", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    await expect(createInvite(IDLE, form(valid))).rejects.toThrow(
      `NEXT_REDIRECT /sign-in?next=${encodeURIComponent(`/app/w/${WORKSPACE_ID}/invites`)}`,
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("tells a non-owner that only the owner can invite", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "rls detail" } });

    const state = await createInvite(IDLE, form(valid));

    expect(state.error).toBe("Only the workspace owner can create invites.");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("hides other database failures behind a generic message", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "secret detail" } });

    const state = await createInvite(IDLE, form(valid));

    expect(state.error).toBe("We could not create the invite. Try again.");
  });
});

describe("revokeInvite", () => {
  const valid = { workspaceId: WORKSPACE_ID, inviteId: INVITE_ID };

  it("sets revoked_at on the active invite of the workspace", async () => {
    const state = await revokeInvite(IDLE, form(valid));

    expect(mocks.from).toHaveBeenCalledWith("invites");
    const values = mocks.update.mock.calls[0]?.[0];
    expect(Object.keys(values ?? {})).toEqual(["revoked_at"]);
    expect(Number.isNaN(Date.parse(values?.revoked_at ?? ""))).toBe(false);
    expect(mocks.eqInvite).toHaveBeenCalledWith("id", INVITE_ID);
    expect(mocks.eqWorkspace).toHaveBeenCalledWith("workspace_id", WORKSPACE_ID);
    expect(mocks.is).toHaveBeenCalledWith("revoked_at", null);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/app/w/${WORKSPACE_ID}/invites`);
    expect(state).toEqual({ error: null });
  });

  it("rejects malformed ids", async () => {
    const state = await revokeInvite(IDLE, form({ workspaceId: WORKSPACE_ID, inviteId: "x" }));

    expect(state.error).toContain("Reload the page");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("redirects visitors without a session", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    await expect(revokeInvite(IDLE, form(valid))).rejects.toThrow("NEXT_REDIRECT /sign-in");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("says so when nothing was revoked", async () => {
    mocks.select.mockResolvedValue({ data: [], error: null });

    const state = await revokeInvite(IDLE, form(valid));

    expect(state.error).toBe("This invite was already revoked or no longer exists.");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("hides database failures behind a generic message", async () => {
    mocks.select.mockResolvedValue({ data: null, error: { code: "XX000", message: "secret" } });

    const state = await revokeInvite(IDLE, form(valid));

    expect(state.error).toBe("We could not revoke the invite. Try again.");
  });
});

describe("acceptInvite", () => {
  it("accepts without a display name and sends the user to the dashboard", async () => {
    await expect(acceptInvite(IDLE, form({ token: TOKEN }))).rejects.toThrow("NEXT_REDIRECT /app");

    expect(mocks.rpc).toHaveBeenCalledWith("accept_invite", { p_token: TOKEN });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app");
  });

  it.each([["../etc"], [""], ["a b"]])("rejects the token %j as invalid", async (token) => {
    const state = await acceptInvite(IDLE, form({ token }));

    expect(state.error).toBe("This invite link is invalid or has expired.");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a missing token", async () => {
    const state = await acceptInvite(IDLE, new FormData());

    expect(state.error).toBe("This invite link is invalid or has expired.");
  });

  it("sends visitors without a session to sign-in and back to the invite", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    await expect(acceptInvite(IDLE, form({ token: TOKEN }))).rejects.toThrow(
      `NEXT_REDIRECT /sign-in?next=${encodeURIComponent(`/invite/${TOKEN}`)}`,
    );
  });

  it("does not let an anonymous session accept as a member", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ ...USER, isAnonymous: true });

    const state = await acceptInvite(IDLE, form({ token: TOKEN }));

    expect(state.error).toContain("Sign in with your email");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps an invalid token from the database", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "detail" } });

    const state = await acceptInvite(IDLE, form({ token: TOKEN }));

    expect(state.error).toBe("This invite link is invalid or has expired.");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("hides other failures behind a generic message", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "secret" } });

    const state = await acceptInvite(IDLE, form({ token: TOKEN }));

    expect(state.error).toBe("We could not accept the invite. Try again.");
  });
});
