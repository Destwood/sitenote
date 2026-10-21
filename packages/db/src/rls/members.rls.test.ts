import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CHECK_VIOLATION,
  UNIQUE_VIOLATION,
  createPublicClient,
  createScenario,
  createTestUser,
  expectCheckViolation,
  deleteTestUsers,
  destroyScenario,
  expectCode,
  expectNoRows,
  expectOneRow,
  expectPermissionDenied,
  expectRlsViolation,
  insertMember,
  unwrap,
  type Scenario,
  type TestUser,
} from "../test-harness";

let scenario: Scenario;
const extraUsers: TestUser[] = [];

beforeAll(async () => {
  scenario = await createScenario();
});

afterAll(async () => {
  await deleteTestUsers(scenario.admin, extraUsers);
  await destroyScenario(scenario);
});

async function newUser(label: string): Promise<TestUser> {
  const user = await createTestUser(scenario.admin, label);
  extraUsers.push(user);
  return user;
}

async function roleOf(workspaceId: string, userId: string): Promise<string | null> {
  const result = await scenario.admin
    .from("members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  expect(result.error).toBeNull();
  return result.data?.[0]?.role ?? null;
}

describe("members select", () => {
  it("shows the whole roster to the owner, a member and a guest", async () => {
    for (const reader of [scenario.owner, scenario.member, scenario.guest]) {
      const result = await reader.client
        .from("members")
        .select("user_id, role")
        .eq("workspace_id", scenario.workspaceId);
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(3);
    }
  });

  it("shows nothing to an outsider or an anonymous non-member", async () => {
    for (const reader of [scenario.outsider, scenario.stranger]) {
      const result = await reader.client
        .from("members")
        .select("user_id, role")
        .eq("workspace_id", scenario.workspaceId);
      expectNoRows(result);
    }
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(await createPublicClient().from("members").select("user_id"));
  });
});

describe("members insert", () => {
  it("lets the owner add a member and a guest", async () => {
    const asMember = await newUser("added-member");
    const asGuest = await newUser("added-guest");
    for (const [user, role] of [
      [asMember, "member"],
      [asGuest, "guest"],
    ] as const) {
      const result = await scenario.owner.client
        .from("members")
        .insert({ workspace_id: scenario.workspaceId, user_id: user.id, role })
        .select("role");
      expectOneRow(result);
      expect(await roleOf(scenario.workspaceId, user.id)).toBe(role);
    }
  });

  it("denies the owner adding another owner", async () => {
    const target = await newUser("wannabe-owner");
    expectCheckViolation(
      await scenario.owner.client
        .from("members")
        .insert({ workspace_id: scenario.workspaceId, user_id: target.id, role: "owner" }),
      /only the workspace owner can hold the owner role/,
    );
    expect(await roleOf(scenario.workspaceId, target.id)).toBeNull();
  });

  it("denies a member, a guest, an outsider and an anonymous non-member adding anybody", async () => {
    const target = await newUser("uninvited");
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectRlsViolation(
        await actor.client
          .from("members")
          .insert({ workspace_id: scenario.workspaceId, user_id: target.id, role: "member" }),
      );
    }
    expect(await roleOf(scenario.workspaceId, target.id)).toBeNull();
  });

  it("denies self-promotion into someone else's workspace", async () => {
    for (const role of ["owner", "member", "guest"] as const) {
      const result = await scenario.outsider.client.from("members").insert({
        workspace_id: scenario.workspaceId,
        user_id: scenario.outsider.id,
        role,
      });
      if (role === "owner") {
        expectCheckViolation(result, /only the workspace owner can hold the owner role/);
      } else {
        expectRlsViolation(result);
      }
    }
    expect(await roleOf(scenario.workspaceId, scenario.outsider.id)).toBeNull();
  });

  it("denies an owner of another workspace adding people to this one", async () => {
    const target = await newUser("cross-workspace");
    expectRlsViolation(
      await scenario.outsider.client
        .from("members")
        .insert({ workspace_id: scenario.workspaceId, user_id: target.id, role: "guest" }),
    );
  });

  it("rejects a duplicate membership", async () => {
    expectCode(
      await scenario.owner.client.from("members").insert({
        workspace_id: scenario.workspaceId,
        user_id: scenario.member.id,
        role: "guest",
      }),
      UNIQUE_VIOLATION,
    );
    expect(await roleOf(scenario.workspaceId, scenario.member.id)).toBe("member");
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(
      await createPublicClient().from("members").insert({
        workspace_id: scenario.workspaceId,
        user_id: scenario.outsider.id,
        role: "member",
      }),
    );
  });
});

describe("members update", () => {
  it("lets the owner switch a non-owner between member and guest", async () => {
    const user = await newUser("switcher");
    await insertMember(scenario.admin, scenario.workspaceId, user.id, "member");
    for (const role of ["guest", "member"] as const) {
      const result = await scenario.owner.client
        .from("members")
        .update({ role })
        .eq("workspace_id", scenario.workspaceId)
        .eq("user_id", user.id)
        .select("role");
      expectOneRow(result);
      expect(await roleOf(scenario.workspaceId, user.id)).toBe(role);
    }
  });

  it("denies the owner promoting anybody to owner", async () => {
    const result = await scenario.owner.client
      .from("members")
      .update({ role: "owner" })
      .eq("workspace_id", scenario.workspaceId)
      .eq("user_id", scenario.member.id);
    expectCheckViolation(result, /only the workspace owner can hold the owner role/);
    expect(await roleOf(scenario.workspaceId, scenario.member.id)).toBe("member");
  });

  it("does not let the owner demote their own owner row", async () => {
    const result = await scenario.owner.client
      .from("members")
      .update({ role: "member" })
      .eq("workspace_id", scenario.workspaceId)
      .eq("user_id", scenario.owner.id)
      .select("role");
    expectNoRows(result);
    expect(await roleOf(scenario.workspaceId, scenario.owner.id)).toBe("owner");
  });

  it("does not let members and guests change any role, their own included", async () => {
    const attempts = [
      { actor: scenario.member, target: scenario.member.id, role: "owner" },
      { actor: scenario.member, target: scenario.member.id, role: "guest" },
      { actor: scenario.member, target: scenario.guest.id, role: "member" },
      { actor: scenario.guest, target: scenario.guest.id, role: "owner" },
      { actor: scenario.guest, target: scenario.guest.id, role: "member" },
      { actor: scenario.member, target: scenario.owner.id, role: "guest" },
    ] as const;
    for (const attempt of attempts) {
      const result = await attempt.actor.client
        .from("members")
        .update({ role: attempt.role })
        .eq("workspace_id", scenario.workspaceId)
        .eq("user_id", attempt.target)
        .select("role");
      expectNoRows(result);
    }
    expect(await roleOf(scenario.workspaceId, scenario.member.id)).toBe("member");
    expect(await roleOf(scenario.workspaceId, scenario.guest.id)).toBe("guest");
    expect(await roleOf(scenario.workspaceId, scenario.owner.id)).toBe("owner");
  });

  it("does not let an outsider or the owner of another workspace change roles", async () => {
    for (const actor of [scenario.outsider, scenario.stranger]) {
      const result = await actor.client
        .from("members")
        .update({ role: "guest" })
        .eq("workspace_id", scenario.workspaceId)
        .eq("user_id", scenario.member.id)
        .select("role");
      expectNoRows(result);
    }
  });

  it("denies moving a membership to another workspace or user", async () => {
    expectPermissionDenied(
      await scenario.owner.client
        .from("members")
        .update({ workspace_id: scenario.otherWorkspaceId })
        .eq("workspace_id", scenario.workspaceId)
        .eq("user_id", scenario.member.id),
    );
    expectPermissionDenied(
      await scenario.owner.client
        .from("members")
        .update({ user_id: scenario.outsider.id })
        .eq("workspace_id", scenario.workspaceId)
        .eq("user_id", scenario.member.id),
    );
  });

  it("keeps the owner role closed even for the service role", async () => {
    const promote = await scenario.admin
      .from("members")
      .update({ role: "owner" })
      .eq("workspace_id", scenario.workspaceId)
      .eq("user_id", scenario.member.id);
    expectCode(promote, CHECK_VIOLATION);
    const demote = await scenario.admin
      .from("members")
      .update({ role: "member" })
      .eq("workspace_id", scenario.workspaceId)
      .eq("user_id", scenario.owner.id);
    expectCode(demote, CHECK_VIOLATION);
    const second = await newUser("second-owner");
    expectCode(
      await scenario.admin
        .from("members")
        .insert({ workspace_id: scenario.workspaceId, user_id: second.id, role: "owner" }),
      CHECK_VIOLATION,
    );
  });
});

describe("members delete", () => {
  it("lets the owner remove a member and a guest", async () => {
    const asMember = await newUser("removed-member");
    const asGuest = await newUser("removed-guest");
    await insertMember(scenario.admin, scenario.workspaceId, asMember.id, "member");
    await insertMember(scenario.admin, scenario.workspaceId, asGuest.id, "guest");
    for (const user of [asMember, asGuest]) {
      const result = await scenario.owner.client
        .from("members")
        .delete()
        .eq("workspace_id", scenario.workspaceId)
        .eq("user_id", user.id)
        .select("id");
      expectOneRow(result);
      expect(await roleOf(scenario.workspaceId, user.id)).toBeNull();
    }
  });

  it("does not let anybody remove the owner, the owner included", async () => {
    for (const actor of [scenario.owner, scenario.member, scenario.guest, scenario.outsider]) {
      const result = await actor.client
        .from("members")
        .delete()
        .eq("workspace_id", scenario.workspaceId)
        .eq("user_id", scenario.owner.id)
        .select("id");
      expectNoRows(result);
    }
    expect(await roleOf(scenario.workspaceId, scenario.owner.id)).toBe("owner");
  });

  it("lets a member and a guest leave but not remove each other", async () => {
    const leaver = await newUser("leaver");
    const guestLeaver = await newUser("guest-leaver");
    await insertMember(scenario.admin, scenario.workspaceId, leaver.id, "member");
    await insertMember(scenario.admin, scenario.workspaceId, guestLeaver.id, "guest");

    const removal = await leaver.client
      .from("members")
      .delete()
      .eq("workspace_id", scenario.workspaceId)
      .eq("user_id", guestLeaver.id)
      .select("id");
    expectNoRows(removal);
    expect(await roleOf(scenario.workspaceId, guestLeaver.id)).toBe("guest");

    for (const user of [leaver, guestLeaver]) {
      const result = await user.client
        .from("members")
        .delete()
        .eq("workspace_id", scenario.workspaceId)
        .eq("user_id", user.id)
        .select("id");
      expectOneRow(result);
      expect(await roleOf(scenario.workspaceId, user.id)).toBeNull();
    }
  });

  it("does not let an outsider or the owner of another workspace remove anybody", async () => {
    for (const actor of [scenario.outsider, scenario.stranger]) {
      const result = await actor.client
        .from("members")
        .delete()
        .eq("workspace_id", scenario.workspaceId)
        .eq("user_id", scenario.member.id)
        .select("id");
      expectNoRows(result);
    }
    expect(await roleOf(scenario.workspaceId, scenario.member.id)).toBe("member");
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(
      await createPublicClient().from("members").delete().eq("workspace_id", scenario.workspaceId),
    );
  });
});

describe("members integrity", () => {
  it("keeps exactly one owner row, held by the workspace owner", async () => {
    const result = unwrap(
      await scenario.admin
        .from("members")
        .select("user_id")
        .eq("workspace_id", scenario.workspaceId)
        .eq("role", "owner"),
    );
    expect(result).toEqual([{ user_id: scenario.owner.id }]);
  });

  it("refreshes updated_at when the role changes", async () => {
    const user = await newUser("timestamp");
    await insertMember(scenario.admin, scenario.workspaceId, user.id, "member");
    const before = unwrap(
      await scenario.admin
        .from("members")
        .select("updated_at")
        .eq("workspace_id", scenario.workspaceId)
        .eq("user_id", user.id)
        .single(),
    );
    await scenario.owner.client
      .from("members")
      .update({ role: "guest" })
      .eq("workspace_id", scenario.workspaceId)
      .eq("user_id", user.id);
    const after = unwrap(
      await scenario.admin
        .from("members")
        .select("updated_at")
        .eq("workspace_id", scenario.workspaceId)
        .eq("user_id", user.id)
        .single(),
    );
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
      new Date(before.updated_at).getTime(),
    );
  });
});
