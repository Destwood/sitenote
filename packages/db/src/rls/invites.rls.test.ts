import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CHECK_VIOLATION,
  createPublicClient,
  createScenario,
  destroyScenario,
  expectCode,
  expectImmutable,
  expectNoRows,
  expectOneRow,
  expectPermissionDenied,
  expectRlsViolation,
  unwrap,
  type Scenario,
} from "../test-harness";

let scenario: Scenario;

beforeAll(async () => {
  scenario = await createScenario();
});

afterAll(async () => {
  await destroyScenario(scenario);
});

function inFuture(hours = 24): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

async function createInvite(role: "member" | "guest" = "guest") {
  return unwrap(
    await scenario.owner.client
      .from("invites")
      .insert({
        workspace_id: scenario.workspaceId,
        role,
        expires_at: inFuture(),
        created_by: scenario.owner.id,
      })
      .select("id, token, role, created_by, revoked_at")
      .single(),
  );
}

async function inviteExists(id: string): Promise<boolean> {
  const result = await scenario.admin.from("invites").select("id").eq("id", id);
  expect(result.error).toBeNull();
  return (result.data?.length ?? 0) > 0;
}

describe("invites insert", () => {
  it("lets the owner create an invite with a generated unguessable token", async () => {
    const invite = await createInvite("guest");
    expect(invite.token).toMatch(/^[0-9a-f]{48}$/);
    expect(invite.created_by).toBe(scenario.owner.id);
    expect(invite.revoked_at).toBeNull();
    const second = await createInvite("member");
    expect(second.token).not.toBe(invite.token);
  });

  it("denies a member, a guest, an outsider and an anonymous non-member", async () => {
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectRlsViolation(
        await actor.client.from("invites").insert({
          workspace_id: scenario.workspaceId,
          role: "guest",
          expires_at: inFuture(),
          created_by: actor.id,
        }),
      );
    }
  });

  it("denies forging created_by", async () => {
    expectRlsViolation(
      await scenario.owner.client.from("invites").insert({
        workspace_id: scenario.workspaceId,
        role: "guest",
        expires_at: inFuture(),
        created_by: scenario.member.id,
      }),
    );
  });

  it("denies inviting somebody as owner", async () => {
    expectRlsViolation(
      await scenario.owner.client.from("invites").insert({
        workspace_id: scenario.workspaceId,
        role: "owner",
        expires_at: inFuture(),
        created_by: scenario.owner.id,
      }),
    );
  });

  it("denies choosing the token or the revocation", async () => {
    expectPermissionDenied(
      await scenario.owner.client.from("invites").insert({
        workspace_id: scenario.workspaceId,
        role: "guest",
        expires_at: inFuture(),
        created_by: scenario.owner.id,
        token: "predictable-token",
      }),
    );
    expectPermissionDenied(
      await scenario.owner.client.from("invites").insert({
        workspace_id: scenario.workspaceId,
        role: "guest",
        expires_at: inFuture(),
        created_by: scenario.owner.id,
        revoked_at: new Date().toISOString(),
      }),
    );
  });

  it("rejects an invite that is already expired", async () => {
    expectCode(
      await scenario.owner.client.from("invites").insert({
        workspace_id: scenario.workspaceId,
        role: "guest",
        expires_at: inFuture(-1),
        created_by: scenario.owner.id,
      }),
      CHECK_VIOLATION,
    );
  });

  it("denies the owner of another workspace", async () => {
    expectRlsViolation(
      await scenario.outsider.client.from("invites").insert({
        workspace_id: scenario.workspaceId,
        role: "guest",
        expires_at: inFuture(),
        created_by: scenario.outsider.id,
      }),
    );
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(
      await createPublicClient().from("invites").insert({
        workspace_id: scenario.workspaceId,
        role: "guest",
        expires_at: inFuture(),
      }),
    );
  });
});

describe("invites select", () => {
  it("shows invites, tokens included, only to the owner", async () => {
    const invite = await createInvite();
    const owned = await scenario.owner.client
      .from("invites")
      .select("id, token")
      .eq("id", invite.id);
    expectOneRow(owned);
    expect(owned.data?.[0]?.token).toBe(invite.token);

    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectNoRows(await actor.client.from("invites").select("id, token").eq("id", invite.id));
      expectNoRows(await actor.client.from("invites").select("id").eq("token", invite.token));
    }
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(await createPublicClient().from("invites").select("id"));
  });
});

describe("invites update", () => {
  it("lets the owner revoke an invite", async () => {
    const invite = await createInvite();
    const result = await scenario.owner.client
      .from("invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", invite.id)
      .select("revoked_at");
    expectOneRow(result);
    expect(result.data?.[0]?.revoked_at).not.toBeNull();
  });

  it("changes nothing for a member, a guest, an outsider or an anonymous non-member", async () => {
    const invite = await createInvite();
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      const result = await actor.client
        .from("invites")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", invite.id)
        .select("id");
      expectNoRows(result);
    }
    const row = unwrap(
      await scenario.admin.from("invites").select("revoked_at").eq("id", invite.id).single(),
    );
    expect(row.revoked_at).toBeNull();
  });

  it("denies rewriting the token, role, workspace, expiry or author", async () => {
    const invite = await createInvite();
    const edits = [
      { token: "swapped" },
      { role: "member" as const },
      { workspace_id: scenario.otherWorkspaceId },
      { expires_at: inFuture(9999) },
      { created_by: scenario.member.id },
    ];
    for (const edit of edits) {
      expectPermissionDenied(
        await scenario.owner.client.from("invites").update(edit).eq("id", invite.id),
      );
    }
  });

  it("keeps the token and workspace immutable even for the service role", async () => {
    const invite = await createInvite();
    expectImmutable(
      await scenario.admin.from("invites").update({ token: randomUUID() }).eq("id", invite.id),
    );
    expectImmutable(
      await scenario.admin
        .from("invites")
        .update({ workspace_id: scenario.otherWorkspaceId })
        .eq("id", invite.id),
    );
  });
});

describe("invites delete", () => {
  it("lets the owner delete an invite", async () => {
    const invite = await createInvite();
    expectOneRow(
      await scenario.owner.client.from("invites").delete().eq("id", invite.id).select("id"),
    );
    expect(await inviteExists(invite.id)).toBe(false);
  });

  it("removes nothing for a member, a guest, an outsider or an anonymous non-member", async () => {
    const invite = await createInvite();
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectNoRows(await actor.client.from("invites").delete().eq("id", invite.id).select("id"));
    }
    expect(await inviteExists(invite.id)).toBe(true);
  });
});
