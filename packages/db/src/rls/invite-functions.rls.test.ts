import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Enums } from "../database-types";
import {
  CHECK_VIOLATION,
  PERMISSION_DENIED,
  createAnonymousTestUser,
  createPublicClient,
  createScenario,
  createTestUser,
  destroyScenario,
  expectCode,
  expectOneRow,
  expectPermissionDenied,
  expectRlsViolation,
  unwrap,
  type Scenario,
  type TestUser,
} from "../test-harness";

const INVALID_PARAMETER = "22023";
const INVALID_PREVIEW = {
  workspace_name: null,
  role: null,
  expires_at: null,
  valid: false,
};

let scenario: Scenario;

beforeAll(async () => {
  scenario = await createScenario();
});

afterAll(async () => {
  await destroyScenario(scenario);
});

async function invite(role: Enums<"member_role"> = "guest", expiresIn = "24 hours") {
  return unwrap(
    await scenario.owner.client.rpc("create_invite", {
      p_workspace_id: scenario.workspaceId,
      p_role: role,
      p_expires_in: expiresIn,
    }),
  );
}

async function backdatedInvite(role: Enums<"member_role">) {
  return unwrap(
    await scenario.admin
      .from("invites")
      .insert({
        workspace_id: scenario.workspaceId,
        role,
        created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        expires_at: new Date(Date.now() - 86_400_000).toISOString(),
        created_by: scenario.owner.id,
      })
      .select("token")
      .single(),
  );
}

async function freshUser(label: string): Promise<TestUser> {
  const user = await createTestUser(scenario.admin, label, { full_name: `Fresh ${label}` });
  scenario.users.push(user);
  return user;
}

async function freshAnonymous(): Promise<TestUser> {
  const user = await createAnonymousTestUser();
  scenario.users.push(user);
  return user;
}

async function roleOf(userId: string): Promise<Enums<"member_role"> | null> {
  const rows = unwrap(
    await scenario.admin
      .from("members")
      .select("role")
      .eq("workspace_id", scenario.workspaceId)
      .eq("user_id", userId),
  );
  return rows[0]?.role ?? null;
}

async function displayNameOf(userId: string): Promise<string> {
  return unwrap(
    await scenario.admin.from("profiles").select("display_name").eq("user_id", userId).single(),
  ).display_name;
}

function accept(user: TestUser, token: string, displayName?: string) {
  return user.client.rpc("accept_invite", {
    p_token: token,
    ...(displayName === undefined ? {} : { p_display_name: displayName }),
  });
}

describe("create_invite", () => {
  it("lets the owner create a guest or member invite with a generated token", async () => {
    const guestInvite = await invite("guest");
    expect(guestInvite).toMatchObject({
      workspace_id: scenario.workspaceId,
      role: "guest",
      created_by: scenario.owner.id,
      revoked_at: null,
    });
    expect(guestInvite.token).toMatch(/^[0-9a-f]{48}$/);
    expect((await invite("member")).role).toBe("member");
  });

  it("expires in seven days by default", async () => {
    const created = unwrap(
      await scenario.owner.client.rpc("create_invite", {
        p_workspace_id: scenario.workspaceId,
        p_role: "guest",
      }),
    );
    const expected = Date.now() + 7 * 86_400_000;
    expect(Math.abs(new Date(created.expires_at).getTime() - expected)).toBeLessThan(60_000);
  });

  it("accepts the limits of one hour and thirty days and rejects anything outside", async () => {
    await invite("guest", "1 hour");
    await invite("guest", "30 days");
    for (const expiresIn of ["59 minutes", "30 days 1 second", "0 seconds", "-1 hours"]) {
      expectCode(
        await scenario.owner.client.rpc("create_invite", {
          p_workspace_id: scenario.workspaceId,
          p_role: "guest",
          p_expires_in: expiresIn,
        }),
        CHECK_VIOLATION,
      );
    }
  });

  it("never grants the owner role", async () => {
    expectCode(
      await scenario.owner.client.rpc("create_invite", {
        p_workspace_id: scenario.workspaceId,
        p_role: "owner",
      }),
      CHECK_VIOLATION,
    );
  });

  it("denies a member, a guest, another workspace's owner and an anonymous non-member", async () => {
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectRlsViolation(
        await actor.client.rpc("create_invite", {
          p_workspace_id: scenario.workspaceId,
          p_role: "guest",
        }),
      );
    }
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(
      await createPublicClient().rpc("create_invite", {
        p_workspace_id: scenario.workspaceId,
        p_role: "guest",
      }),
    );
  });
});

describe("invite_preview", () => {
  it("shows the workspace name, role and expiry of a valid invite to a signed-out visitor", async () => {
    const created = await invite("guest");
    const result = await createPublicClient().rpc("invite_preview", { p_token: created.token });
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        workspace_name: "Workspace A",
        role: "guest",
        expires_at: created.expires_at,
        valid: true,
      },
    ]);
  });

  it("works for signed-in users too", async () => {
    const created = await invite("member");
    for (const user of [scenario.outsider, scenario.stranger]) {
      const result = await user.client.rpc("invite_preview", { p_token: created.token });
      expect(result.data?.[0]).toMatchObject({ valid: true, role: "member" });
    }
  });

  it("answers the same for unknown, expired and revoked tokens", async () => {
    const revoked = await invite("guest");
    expectOneRow(
      await scenario.owner.client
        .from("invites")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", revoked.id)
        .select("id"),
    );
    const expired = await backdatedInvite("guest");
    for (const token of [revoked.token, expired.token, "0".repeat(48), "", "not a token"]) {
      const result = await createPublicClient().rpc("invite_preview", { p_token: token });
      expect(result.error).toBeNull();
      expect(result.data).toEqual([INVALID_PREVIEW]);
    }
  });
});

describe("accept_invite", () => {
  it("makes an anonymous visitor a guest and stores the trimmed display name", async () => {
    const created = await invite("guest");
    const visitor = await freshAnonymous();
    const result = await accept(visitor, created.token, "  Pat Client  ");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ workspace_id: scenario.workspaceId, role: "guest" }]);
    expect(await roleOf(visitor.id)).toBe("guest");
    expect(await displayNameOf(visitor.id)).toBe("Pat Client");
    expectOneRow(
      await visitor.client.from("sites").select("id").eq("workspace_id", scenario.workspaceId),
    );
  });

  it("refuses an anonymous visitor a member invite", async () => {
    const created = await invite("member");
    const visitor = await freshAnonymous();
    expectCode(await accept(visitor, created.token, "Pat Client"), PERMISSION_DENIED);
    expect(await roleOf(visitor.id)).toBeNull();
  });

  it("requires a display name of 1 to 80 characters from an anonymous visitor", async () => {
    const created = await invite("guest");
    const visitor = await freshAnonymous();
    for (const name of [undefined, "", "   ", "\n\t", "x".repeat(81)]) {
      expectCode(await accept(visitor, created.token, name), INVALID_PARAMETER);
    }
    expect(await roleOf(visitor.id)).toBeNull();
    expect((await accept(visitor, created.token, "x".repeat(80))).error).toBeNull();
    expect(await displayNameOf(visitor.id)).toBe("x".repeat(80));
  });

  it("makes a registered user a guest or a member as the invite says and keeps their name", async () => {
    const asGuest = await freshUser("viaguest");
    const guestResult = await accept(asGuest, (await invite("guest")).token, "Ignored Name");
    expect(guestResult.data).toEqual([{ workspace_id: scenario.workspaceId, role: "guest" }]);
    expect(await roleOf(asGuest.id)).toBe("guest");
    expect(await displayNameOf(asGuest.id)).toBe("Fresh viaguest");

    const asMember = await freshUser("viamember");
    const memberResult = await accept(asMember, (await invite("member")).token);
    expect(memberResult.data).toEqual([{ workspace_id: scenario.workspaceId, role: "member" }]);
    expect(await roleOf(asMember.id)).toBe("member");
  });

  it("never downgrades and does upgrade a guest to member", async () => {
    const guestInvite = await invite("guest");
    const memberInvite = await invite("member");

    expect((await accept(scenario.member, guestInvite.token)).data).toEqual([
      { workspace_id: scenario.workspaceId, role: "member" },
    ]);
    expect(await roleOf(scenario.member.id)).toBe("member");

    for (const token of [guestInvite.token, memberInvite.token]) {
      expect((await accept(scenario.owner, token)).data).toEqual([
        { workspace_id: scenario.workspaceId, role: "owner" },
      ]);
    }
    expect(await roleOf(scenario.owner.id)).toBe("owner");

    const upgraded = await freshUser("upgrade");
    await accept(upgraded, guestInvite.token);
    expect((await accept(upgraded, memberInvite.token)).data).toEqual([
      { workspace_id: scenario.workspaceId, role: "member" },
    ]);
    expect(await roleOf(upgraded.id)).toBe("member");
  });

  it("keeps an anonymous guest's membership when the link is used again", async () => {
    const created = await invite("guest");
    const visitor = await freshAnonymous();
    await accept(visitor, created.token, "First Name");
    const again = await accept(visitor, created.token, "Second Name");
    expect(again.data).toEqual([{ workspace_id: scenario.workspaceId, role: "guest" }]);
    const rows = unwrap(
      await scenario.admin
        .from("members")
        .select("id")
        .eq("workspace_id", scenario.workspaceId)
        .eq("user_id", visitor.id),
    );
    expect(rows).toHaveLength(1);
    expect(await displayNameOf(visitor.id)).toBe("Second Name");
  });

  it("can be used by several people until it expires or is revoked", async () => {
    const created = await invite("guest");
    const first = await freshAnonymous();
    const second = await freshAnonymous();
    expect((await accept(first, created.token, "One")).error).toBeNull();
    expect((await accept(second, created.token, "Two")).error).toBeNull();
    expectOneRow(
      await scenario.owner.client
        .from("invites")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", created.id)
        .select("id"),
    );
    const late = await freshAnonymous();
    expectCode(await accept(late, created.token, "Late"), INVALID_PARAMETER);
    expect(await roleOf(late.id)).toBeNull();
  });

  it("rejects unknown, expired and revoked tokens with one indistinguishable error", async () => {
    const expired = await backdatedInvite("guest");
    const revoked = await invite("guest");
    await scenario.admin
      .from("invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", revoked.id);
    const user = await freshUser("rejected");
    const messages = new Set<string>();
    for (const token of [expired.token, revoked.token, "f".repeat(48), "", randomUUID()]) {
      const result = await accept(user, token);
      expectCode(result, INVALID_PARAMETER);
      messages.add(result.error?.message ?? "");
    }
    expect(messages.size).toBe(1);
    expect(await roleOf(user.id)).toBeNull();
  });

  it("denies the unauthenticated role", async () => {
    const created = await invite("guest");
    expectPermissionDenied(
      await createPublicClient().rpc("accept_invite", {
        p_token: created.token,
        p_display_name: "Nobody",
      }),
    );
  });
});
