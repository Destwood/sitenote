import { AuthRetryableFetchError, type Session, type User } from "@supabase/supabase-js";
import type { SitenoteClient } from "@sitenote/db";
import { describe, expect, it, vi } from "vitest";

import { createSessionHandoff } from ".";

const TOKENS = { accessToken: "access-token", refreshToken: "refresh-token" };

function user(isAnonymous: boolean | undefined): User {
  return {
    id: "user-1",
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-10-22T00:00:00Z",
    ...(isAnonymous === undefined ? {} : { is_anonymous: isAnonymous }),
  };
}

function storedSession(isAnonymous: boolean): Session {
  return {
    access_token: "old",
    refresh_token: "old-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 1_900_000_000,
    user: user(isAnonymous),
  };
}

interface Options {
  current?: Session | null;
  identity?: { data: { user: User | null }; error: Error | null };
  memberships?: { data: { workspace_id: string }[] | null; error: Error | null };
  setSession?: { error: Error | null };
}

function setup(options: Options = {}) {
  const getSession = vi.fn(() => Promise.resolve({ data: { session: options.current ?? null } }));
  const setSession = vi.fn(() => Promise.resolve(options.setSession ?? { error: null }));
  const client = { auth: { getSession, setSession } } as unknown as SitenoteClient;

  const limit = vi.fn(() =>
    Promise.resolve(options.memberships ?? { data: [{ workspace_id: "w-1" }], error: null }),
  );
  const eq = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const getUser = vi.fn(() =>
    Promise.resolve(options.identity ?? { data: { user: user(true) }, error: null }),
  );
  const probe = { auth: { getUser }, from } as unknown as SitenoteClient;
  const createProbe = vi.fn(() => probe);

  return {
    handoff: createSessionHandoff({ client, createProbe }),
    setSession,
    getUser,
    from,
    eq,
    createProbe,
  };
}

describe("accept", () => {
  it("stores an anonymous session that belongs to a workspace", async () => {
    const { handoff, setSession, createProbe, getUser, from, eq } = setup();

    const result = await handoff.accept(TOKENS);

    expect(result).toEqual({ ok: true, data: null });
    expect(createProbe).toHaveBeenCalledWith("access-token");
    expect(getUser).toHaveBeenCalledWith("access-token");
    expect(from).toHaveBeenCalledWith("members");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(setSession).toHaveBeenCalledWith({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
  });

  it("replaces an existing guest session", async () => {
    const { handoff, setSession } = setup({ current: storedSession(true) });

    expect(await handoff.accept(TOKENS)).toEqual({ ok: true, data: null });
    expect(setSession).toHaveBeenCalledOnce();
  });

  it("refuses when a registered user is signed in and keeps the stored session", async () => {
    const { handoff, setSession, createProbe } = setup({ current: storedSession(false) });

    const result = await handoff.accept(TOKENS);

    expect(result).toMatchObject({ ok: false, error: { code: "already_signed_in" } });
    expect(createProbe).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
  });

  it.each([false, undefined])(
    "refuses a session whose user is not anonymous (is_anonymous %s)",
    async (flag) => {
      const { handoff, setSession } = setup({
        identity: { data: { user: user(flag) }, error: null },
      });

      expect(await handoff.accept(TOKENS)).toMatchObject({
        ok: false,
        error: { code: "session_rejected" },
      });
      expect(setSession).not.toHaveBeenCalled();
    },
  );

  it("refuses tokens the server does not accept", async () => {
    const { handoff, setSession } = setup({
      identity: { data: { user: null }, error: new Error("invalid JWT") },
    });

    expect(await handoff.accept(TOKENS)).toMatchObject({
      ok: false,
      error: { code: "session_rejected" },
    });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("reports a network failure while checking the tokens", async () => {
    const { handoff, setSession } = setup({
      identity: {
        data: { user: null },
        error: new AuthRetryableFetchError("offline", 0),
      },
    });

    expect(await handoff.accept(TOKENS)).toMatchObject({ ok: false, error: { code: "network" } });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("refuses a user who belongs to no workspace", async () => {
    const { handoff, setSession } = setup({ memberships: { data: [], error: null } });

    expect(await handoff.accept(TOKENS)).toMatchObject({
      ok: false,
      error: { code: "session_rejected" },
    });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("refuses when the membership lookup fails", async () => {
    const { handoff, setSession } = setup({
      memberships: { data: null, error: new Error("denied") },
    });

    expect(await handoff.accept(TOKENS)).toMatchObject({
      ok: false,
      error: { code: "session_rejected" },
    });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("refuses when storing the session fails", async () => {
    const { handoff } = setup({ setSession: { error: new Error("bad refresh token") } });

    expect(await handoff.accept(TOKENS)).toMatchObject({
      ok: false,
      error: { code: "session_rejected" },
    });
  });

  it("answers unknown when something throws", async () => {
    const { handoff, getUser } = setup();
    getUser.mockRejectedValueOnce(new Error("boom"));

    expect(await handoff.accept(TOKENS)).toMatchObject({ ok: false, error: { code: "unknown" } });
  });
});
