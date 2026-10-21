import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CHECK_VIOLATION,
  createPublicClient,
  createScenario,
  createTestUser,
  deleteTestUsers,
  destroyScenario,
  expectCode,
  expectImmutable,
  expectNoRows,
  expectOneRow,
  expectPermissionDenied,
  expectRlsViolation,
  insertMember,
  insertWorkspace,
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

async function workspaceOf(id: string) {
  return unwrap(await scenario.admin.from("workspaces").select("*").eq("id", id).single());
}

async function workspaceExists(id: string): Promise<boolean> {
  const result = await scenario.admin.from("workspaces").select("id").eq("id", id);
  expect(result.error).toBeNull();
  return (result.data?.length ?? 0) > 0;
}

describe("workspaces select", () => {
  it("is visible to the owner, a member and a guest", async () => {
    for (const reader of [scenario.owner, scenario.member, scenario.guest]) {
      const result = await reader.client
        .from("workspaces")
        .select("id, name")
        .eq("id", scenario.workspaceId);
      expectOneRow(result);
    }
  });

  it("is invisible to an outsider and to an anonymous non-member", async () => {
    for (const reader of [scenario.outsider, scenario.stranger]) {
      const result = await reader.client
        .from("workspaces")
        .select("id, name")
        .eq("id", scenario.workspaceId);
      expectNoRows(result);
    }
  });

  it("lists only the workspaces the user belongs to", async () => {
    const result = await scenario.outsider.client.from("workspaces").select("id");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: scenario.otherWorkspaceId }]);
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(await createPublicClient().from("workspaces").select("id"));
  });
});

describe("workspaces insert", () => {
  it("lets a registered user create a workspace they own and adds them as owner member", async () => {
    const creator = await createTestUser(scenario.admin, "creator");
    extraUsers.push(creator);
    const result = await creator.client
      .from("workspaces")
      .insert({ name: "Creator Studio", owner_id: creator.id })
      .select("id, name, owner_id")
      .single();
    const workspace = unwrap(result);
    expect(workspace.owner_id).toBe(creator.id);
    const memberships = unwrap(
      await scenario.admin.from("members").select("user_id, role").eq("workspace_id", workspace.id),
    );
    expect(memberships).toEqual([{ user_id: creator.id, role: "owner" }]);
  });

  it("denies creating a workspace owned by somebody else", async () => {
    expectRlsViolation(
      await scenario.member.client
        .from("workspaces")
        .insert({ name: "Stolen", owner_id: scenario.owner.id }),
    );
  });

  it("denies anonymous users, including guests of an existing workspace", async () => {
    for (const anonymous of [scenario.stranger, scenario.guest]) {
      expectRlsViolation(
        await anonymous.client
          .from("workspaces")
          .insert({ name: "Anonymous Studio", owner_id: anonymous.id }),
      );
    }
  });

  it("lets a registered user who is a guest elsewhere create their own workspace", async () => {
    const registeredGuest = await createTestUser(scenario.admin, "registered-guest");
    extraUsers.push(registeredGuest);
    await insertMember(scenario.admin, scenario.workspaceId, registeredGuest.id, "guest");
    const result = await registeredGuest.client
      .from("workspaces")
      .insert({ name: "Guest Studio", owner_id: registeredGuest.id })
      .select("id");
    expectOneRow(result);
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(
      await createPublicClient()
        .from("workspaces")
        .insert({ name: "Anon", owner_id: scenario.owner.id }),
    );
  });

  it("rejects invalid names", async () => {
    for (const name of ["", "   ", "w".repeat(81)]) {
      expectCode(
        await scenario.owner.client
          .from("workspaces")
          .insert({ name, owner_id: scenario.owner.id }),
        CHECK_VIOLATION,
      );
    }
  });

  it("denies choosing the id or timestamps", async () => {
    expectPermissionDenied(
      await scenario.owner.client.from("workspaces").insert({
        id: randomUUID(),
        name: "Chosen id",
        owner_id: scenario.owner.id,
      }),
    );
    expectPermissionDenied(
      await scenario.owner.client.from("workspaces").insert({
        name: "Backdated",
        owner_id: scenario.owner.id,
        created_at: "2000-01-01T00:00:00Z",
      }),
    );
  });
});

describe("workspaces update", () => {
  it("lets the owner rename the workspace and refreshes updated_at", async () => {
    const before = await workspaceOf(scenario.workspaceId);
    const result = await scenario.owner.client
      .from("workspaces")
      .update({ name: "Renamed A" })
      .eq("id", scenario.workspaceId)
      .select("name");
    expectOneRow(result);
    const after = await workspaceOf(scenario.workspaceId);
    expect(after.name).toBe("Renamed A");
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
      new Date(before.updated_at).getTime(),
    );
  });

  it("changes nothing for a member, a guest, an outsider or an anonymous non-member", async () => {
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      const result = await actor.client
        .from("workspaces")
        .update({ name: "Hijacked" })
        .eq("id", scenario.workspaceId)
        .select("id");
      expectNoRows(result);
    }
    const row = await workspaceOf(scenario.workspaceId);
    expect(row.name).not.toBe("Hijacked");
  });

  it("denies changing the owner, even for the owner", async () => {
    expectPermissionDenied(
      await scenario.owner.client
        .from("workspaces")
        .update({ owner_id: scenario.member.id })
        .eq("id", scenario.workspaceId),
    );
    expectPermissionDenied(
      await scenario.member.client
        .from("workspaces")
        .update({ owner_id: scenario.member.id })
        .eq("id", scenario.workspaceId),
    );
  });

  it("keeps the owner immutable even for the service role", async () => {
    expectImmutable(
      await scenario.admin
        .from("workspaces")
        .update({ owner_id: scenario.member.id })
        .eq("id", scenario.workspaceId),
    );
  });

  it("rejects an invalid name", async () => {
    expectCode(
      await scenario.owner.client
        .from("workspaces")
        .update({ name: "" })
        .eq("id", scenario.workspaceId),
      CHECK_VIOLATION,
    );
  });
});

describe("workspaces delete", () => {
  it("removes nothing for a member, a guest, an outsider or an anonymous non-member", async () => {
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      const result = await actor.client
        .from("workspaces")
        .delete()
        .eq("id", scenario.workspaceId)
        .select("id");
      expectNoRows(result);
    }
    expect(await workspaceExists(scenario.workspaceId)).toBe(true);
  });

  it("lets the owner delete the workspace with everything under it", async () => {
    const owner = await createTestUser(scenario.admin, "deleter");
    extraUsers.push(owner);
    const workspaceId = await insertWorkspace(scenario.admin, owner.id, "Doomed");
    const result = await owner.client
      .from("workspaces")
      .delete()
      .eq("id", workspaceId)
      .select("id");
    expectOneRow(result);
    expect(await workspaceExists(workspaceId)).toBe(false);
    const members = await scenario.admin
      .from("members")
      .select("id")
      .eq("workspace_id", workspaceId);
    expectNoRows(members);
  });
});
