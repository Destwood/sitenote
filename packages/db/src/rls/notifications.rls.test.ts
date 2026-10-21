import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createPublicClient,
  createScenario,
  destroyScenario,
  expectImmutable,
  expectNoRows,
  expectOneRow,
  expectPermissionDenied,
  insertComment,
  insertThread,
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

async function newNotification(userId: string) {
  const thread = await insertThread(scenario.admin, scenario.site, scenario.owner.id);
  const comment = await insertComment(scenario.admin, thread, scenario.owner.id);
  return unwrap(
    await scenario.admin
      .from("notifications")
      .insert({
        user_id: userId,
        workspace_id: scenario.workspaceId,
        thread_id: thread.id,
        comment_id: comment.id,
        kind: "mention",
      })
      .select("*")
      .single(),
  );
}

async function notificationExists(id: string): Promise<boolean> {
  const result = await scenario.admin.from("notifications").select("id").eq("id", id);
  expect(result.error).toBeNull();
  return (result.data?.length ?? 0) > 0;
}

describe("notifications select", () => {
  it("is visible only to the recipient", async () => {
    const notification = await newNotification(scenario.member.id);
    expectOneRow(
      await scenario.member.client.from("notifications").select("id").eq("id", notification.id),
    );
    for (const reader of [scenario.owner, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectNoRows(
        await reader.client.from("notifications").select("id").eq("id", notification.id),
      );
    }
  });

  it("is hidden once the recipient has left the workspace", async () => {
    const notification = await newNotification(scenario.guest.id);
    expectOneRow(
      await scenario.guest.client.from("notifications").select("id").eq("id", notification.id),
    );
    await scenario.admin
      .from("members")
      .delete()
      .eq("workspace_id", scenario.workspaceId)
      .eq("user_id", scenario.guest.id);
    expectNoRows(
      await scenario.guest.client.from("notifications").select("id").eq("id", notification.id),
    );
    await scenario.admin
      .from("members")
      .insert({ workspace_id: scenario.workspaceId, user_id: scenario.guest.id, role: "guest" });
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(await createPublicClient().from("notifications").select("id"));
  });
});

describe("notifications insert", () => {
  it("cannot be created by any client role", async () => {
    const thread = await insertThread(scenario.admin, scenario.site, scenario.owner.id);
    const comment = await insertComment(scenario.admin, thread, scenario.owner.id);
    for (const actor of [scenario.owner, scenario.member, scenario.guest, scenario.outsider]) {
      expectPermissionDenied(
        await actor.client.from("notifications").insert({
          user_id: actor.id,
          workspace_id: scenario.workspaceId,
          thread_id: thread.id,
          comment_id: comment.id,
          kind: "reply",
        }),
      );
    }
  });
});

describe("notifications update", () => {
  it("lets the recipient mark it as read", async () => {
    const notification = await newNotification(scenario.member.id);
    const result = await scenario.member.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notification.id)
      .select("read_at");
    expectOneRow(result);
    expect(result.data?.[0]?.read_at).not.toBeNull();
  });

  it("changes nothing for anybody else", async () => {
    const notification = await newNotification(scenario.member.id);
    for (const actor of [scenario.owner, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectNoRows(
        await actor.client
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", notification.id)
          .select("id"),
      );
    }
    const row = unwrap(
      await scenario.admin
        .from("notifications")
        .select("read_at")
        .eq("id", notification.id)
        .single(),
    );
    expect(row.read_at).toBeNull();
  });

  it("denies redirecting or rewriting a notification", async () => {
    const notification = await newNotification(scenario.member.id);
    const edits = [
      { user_id: scenario.owner.id },
      { workspace_id: scenario.otherWorkspaceId },
      { thread_id: randomUUID() },
      { comment_id: randomUUID() },
      { kind: "reply" as const },
    ];
    for (const edit of edits) {
      expectPermissionDenied(
        await scenario.member.client.from("notifications").update(edit).eq("id", notification.id),
      );
    }
    expectImmutable(
      await scenario.admin
        .from("notifications")
        .update({ user_id: scenario.owner.id })
        .eq("id", notification.id),
    );
  });
});

describe("notifications delete", () => {
  it("lets the recipient delete it", async () => {
    const notification = await newNotification(scenario.member.id);
    expectOneRow(
      await scenario.member.client
        .from("notifications")
        .delete()
        .eq("id", notification.id)
        .select("id"),
    );
    expect(await notificationExists(notification.id)).toBe(false);
  });

  it("removes nothing for anybody else", async () => {
    const notification = await newNotification(scenario.member.id);
    for (const actor of [scenario.owner, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectNoRows(
        await actor.client.from("notifications").delete().eq("id", notification.id).select("id"),
      );
    }
    expect(await notificationExists(notification.id)).toBe(true);
  });
});
