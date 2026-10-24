import { describe, expect, it, vi } from "vitest";

import type { SitenoteClient } from "@sitenote/db";

import { DEMO_NAME_MAX_LENGTH, enterSite, parseDemoName, readVisitorName, startVisit } from ".";

interface FakeOptions {
  session?: { user: { id: string } } | null;
  signIn?: { error: { message: string } | null };
  join?: { error: { message: string } | null };
  site?: { error: { message: string } | null };
  profile?: { data: { display_name: string } | null; error: { message: string } | null };
}

function fakeClient(options: FakeOptions = {}) {
  const getSession = vi.fn(() =>
    Promise.resolve({ data: { session: options.session ?? null }, error: null }),
  );
  const signInAnonymously = vi.fn(() => Promise.resolve(options.signIn ?? { error: null }));
  const rpc = vi.fn((name: string) => {
    if (name === "join_demo") {
      return Promise.resolve(options.join ?? { data: [{ workspace_id: "w" }], error: null });
    }
    return Promise.resolve(options.site ?? { data: [{ site_id: "s" }], error: null });
  });
  const maybeSingle = vi.fn(() => Promise.resolve(options.profile ?? { data: null, error: null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const client = {
    auth: { getSession, signInAnonymously },
    rpc,
    from,
  } as unknown as SitenoteClient;
  return { client, getSession, signInAnonymously, rpc, from, eq };
}

describe("parseDemoName", () => {
  it("trims the name and accepts up to 40 characters", () => {
    expect(parseDemoName("  Demo Dana ")).toBe("Demo Dana");
    expect(parseDemoName("a".repeat(DEMO_NAME_MAX_LENGTH))).toBe("a".repeat(40));
  });

  it("counts characters rather than UTF-16 units", () => {
    expect(parseDemoName("😀".repeat(40))).toBe("😀".repeat(40));
    expect(parseDemoName("😀".repeat(41))).toBeNull();
  });

  it.each(["", "   ", "a".repeat(41), null, undefined, 7])("rejects %j", (value) => {
    expect(parseDemoName(value)).toBeNull();
  });
});

describe("readVisitorName", () => {
  it("returns null without a session", async () => {
    const { client, from } = fakeClient();
    expect(await readVisitorName(client)).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("returns the display name of the stored session", async () => {
    const { client, eq } = fakeClient({
      session: { user: { id: "user-1" } },
      profile: { data: { display_name: "Dana" }, error: null },
    });
    expect(await readVisitorName(client)).toBe("Dana");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns null when the profile cannot be read", async () => {
    const { client } = fakeClient({
      session: { user: { id: "user-1" } },
      profile: { data: null, error: { message: "denied" } },
    });
    expect(await readVisitorName(client)).toBeNull();
  });
});

describe("startVisit", () => {
  it("signs in anonymously and joins when there is no session", async () => {
    const { client, signInAnonymously, rpc } = fakeClient();
    await startVisit(client, "Dana");
    expect(signInAnonymously).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("join_demo", { p_display_name: "Dana" });
  });

  it("keeps an existing session and only joins", async () => {
    const { client, signInAnonymously, rpc } = fakeClient({ session: { user: { id: "u" } } });
    await startVisit(client, "Dana");
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("join_demo", { p_display_name: "Dana" });
  });

  it("fails when anonymous sign-in or the join is refused", async () => {
    const refused = fakeClient({ signIn: { error: { message: "disabled" } } });
    await expect(startVisit(refused.client, "Dana")).rejects.toThrow(
      "The demo could not start a guest session.",
    );
    const denied = fakeClient({
      session: { user: { id: "u" } },
      join: { error: { message: "denied" } },
    });
    await expect(startVisit(denied.client, "Dana")).rejects.toThrow(
      "The demo could not add the guest to the workspace.",
    );
  });
});

describe("enterSite", () => {
  it("registers the origin for the demo", async () => {
    const { client, rpc } = fakeClient();
    await enterSite(client, "http://localhost:3000");
    expect(rpc).toHaveBeenCalledWith("demo_site", { p_origin: "http://localhost:3000" });
  });

  it("fails when the origin is refused", async () => {
    const { client } = fakeClient({ site: { error: { message: "not allowed" } } });
    await expect(enterSite(client, "https://example.com")).rejects.toThrow(
      "The demo could not register this page.",
    );
  });
});
