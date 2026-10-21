import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CHECK_VIOLATION,
  ELEMENT_ANCHOR,
  createScenario,
  createTestUser,
  destroyScenario,
  expectCheckViolation,
  expectCode,
  expectOneRow,
  insertComment,
  insertMember,
  insertThread,
  unwrap,
  type Scenario,
  type TestUser,
} from "../test-harness";

let scenario: Scenario;

beforeAll(async () => {
  scenario = await createScenario();
});

afterAll(async () => {
  await destroyScenario(scenario);
});

async function newThread(createdBy: TestUser = scenario.owner) {
  return insertThread(scenario.admin, scenario.site, createdBy.id);
}

async function post(
  author: TestUser,
  threadId: string,
  mentions: string[] = [],
  body = "A comment",
) {
  return unwrap(
    await author.client
      .from("comments")
      .insert({
        thread_id: threadId,
        workspace_id: scenario.workspaceId,
        author_id: author.id,
        body,
        mentions,
      })
      .select("id, mentions")
      .single(),
  );
}

async function notificationsFor(commentId: string) {
  const rows = unwrap(
    await scenario.admin
      .from("notifications")
      .select("user_id, kind, thread_id, workspace_id")
      .eq("comment_id", commentId),
  );
  return rows.map((row) => `${row.user_id}:${row.kind}`).sort();
}

function expected(...pairs: [TestUser, "reply" | "mention"][]): string[] {
  return pairs.map(([user, kind]) => `${user.id}:${kind}`).sort();
}

describe("mentions normalisation", () => {
  it("removes duplicates and keeps the order of first appearance", async () => {
    const thread = await newThread();
    const comment = await post(scenario.member, thread.id, [
      scenario.owner.id,
      scenario.guest.id,
      scenario.owner.id,
      scenario.guest.id,
    ]);
    expect(comment.mentions).toEqual([scenario.owner.id, scenario.guest.id]);
  });

  it("removes the author from the mentions", async () => {
    const thread = await newThread();
    const comment = await post(scenario.member, thread.id, [scenario.member.id, scenario.owner.id]);
    expect(comment.mentions).toEqual([scenario.owner.id]);
    const selfOnly = await post(scenario.member, thread.id, [scenario.member.id]);
    expect(selfOnly.mentions).toEqual([]);
  });

  it("rejects an id that is not a member of the workspace", async () => {
    const thread = await newThread();
    for (const mentions of [
      [scenario.outsider.id],
      [scenario.stranger.id],
      [scenario.owner.id, randomUUID()],
    ]) {
      expectCheckViolation(
        await scenario.member.client.from("comments").insert({
          thread_id: thread.id,
          workspace_id: scenario.workspaceId,
          author_id: scenario.member.id,
          body: "@somebody",
          mentions,
        }),
        /mentions must be members/,
      );
    }
  });

  it("accepts 20 mentions and rejects 21, counted before duplicates are removed", async () => {
    const thread = await newThread();
    const twenty = Array.from({ length: 20 }, () => scenario.owner.id);
    expect((await post(scenario.member, thread.id, twenty)).mentions).toEqual([scenario.owner.id]);
    expectCheckViolation(
      await scenario.member.client.from("comments").insert({
        thread_id: thread.id,
        workspace_id: scenario.workspaceId,
        author_id: scenario.member.id,
        body: "everyone",
        mentions: [...twenty, scenario.owner.id],
      }),
      /at most 20/,
    );
  });

  it("normalises mentions on update as well", async () => {
    const thread = await newThread();
    const comment = await post(scenario.member, thread.id);
    const updated = await scenario.member.client
      .from("comments")
      .update({ mentions: [scenario.owner.id, scenario.member.id, scenario.owner.id] })
      .eq("id", comment.id)
      .select("mentions");
    expectOneRow(updated);
    expect(updated.data?.[0]?.mentions).toEqual([scenario.owner.id]);
    expectCheckViolation(
      await scenario.member.client
        .from("comments")
        .update({ mentions: [scenario.outsider.id] })
        .eq("id", comment.id),
      /mentions must be members/,
    );
    expectCode(
      await scenario.member.client
        .from("comments")
        .update({ mentions: Array.from({ length: 21 }, () => scenario.owner.id) })
        .eq("id", comment.id),
      CHECK_VIOLATION,
    );
  });

  it("does not notify anybody when mentions are edited afterwards", async () => {
    const thread = await newThread(scenario.member);
    const comment = await post(scenario.member, thread.id);
    await scenario.member.client
      .from("comments")
      .update({ mentions: [scenario.owner.id] })
      .eq("id", comment.id);
    expect(await notificationsFor(comment.id)).toEqual([]);
  });
});

describe("notification fan-out", () => {
  it("creates nothing for the first comment of a thread the author started", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.owner.id);
    expect(await notificationsFor(comment.id)).toEqual([]);
  });

  it("notifies the thread creator and earlier participants of a reply, never the author", async () => {
    const thread = await newThread();
    await insertComment(scenario.admin, thread, scenario.owner.id);
    const memberReply = await post(scenario.member, thread.id);
    expect(await notificationsFor(memberReply.id)).toEqual(expected([scenario.owner, "reply"]));

    const guestReply = await post(scenario.guest, thread.id);
    expect(await notificationsFor(guestReply.id)).toEqual(
      expected([scenario.owner, "reply"], [scenario.member, "reply"]),
    );

    const ownerReply = await post(scenario.owner, thread.id);
    expect(await notificationsFor(ownerReply.id)).toEqual(
      expected([scenario.member, "reply"], [scenario.guest, "reply"]),
    );
  });

  it("records the workspace and thread of the comment", async () => {
    const thread = await newThread();
    const reply = await post(scenario.member, thread.id);
    const rows = unwrap(
      await scenario.admin
        .from("notifications")
        .select("workspace_id, thread_id, read_at")
        .eq("comment_id", reply.id),
    );
    expect(rows).toEqual([
      { workspace_id: scenario.workspaceId, thread_id: thread.id, read_at: null },
    ]);
  });

  it("sends one mention instead of a reply to a participant who is mentioned", async () => {
    const thread = await newThread();
    await post(scenario.member, thread.id);
    const comment = await post(scenario.owner, thread.id, [scenario.member.id]);
    expect(await notificationsFor(comment.id)).toEqual(expected([scenario.member, "mention"]));
  });

  it("notifies a mentioned non-participant with a mention and the others with a reply", async () => {
    const thread = await newThread();
    await post(scenario.member, thread.id);
    const comment = await post(scenario.owner, thread.id, [scenario.guest.id]);
    expect(await notificationsFor(comment.id)).toEqual(
      expected([scenario.guest, "mention"], [scenario.member, "reply"]),
    );
  });

  it("does not notify an author who mentions themselves", async () => {
    const thread = await newThread();
    const comment = await post(scenario.owner, thread.id, [scenario.owner.id]);
    expect(await notificationsFor(comment.id)).toEqual([]);
  });

  it("ignores participants whose only comments were deleted", async () => {
    const thread = await newThread();
    const deleted = await post(scenario.member, thread.id);
    expectOneRow(
      await scenario.member.client
        .from("comments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", deleted.id)
        .select("id"),
    );
    const reply = await post(scenario.guest, thread.id);
    expect(await notificationsFor(reply.id)).toEqual(expected([scenario.owner, "reply"]));
  });

  it("skips users who are no longer members", async () => {
    const leaver = await createTestUser(scenario.admin, "leaver");
    scenario.users.push(leaver);
    await insertMember(scenario.admin, scenario.workspaceId, leaver.id, "member");
    const thread = await newThread();
    await post(leaver, thread.id);
    await scenario.admin
      .from("members")
      .delete()
      .eq("workspace_id", scenario.workspaceId)
      .eq("user_id", leaver.id);
    const reply = await post(scenario.owner, thread.id);
    expect(await notificationsFor(reply.id)).toEqual([]);
  });

  it("does not fail when the thread creator account is gone", async () => {
    const creator = await createTestUser(scenario.admin, "creator");
    await insertMember(scenario.admin, scenario.workspaceId, creator.id, "member");
    const thread = await newThread(creator);
    await scenario.admin.auth.admin.deleteUser(creator.id);
    const reply = await post(scenario.member, thread.id);
    expect(await notificationsFor(reply.id)).toEqual([]);
  });

  it("notifies through create_thread for the mentions of the first comment", async () => {
    const created = await scenario.member.client.rpc("create_thread", {
      p_site_id: scenario.site.id,
      p_page_url: `${scenario.site.origin}/${randomUUID()}`,
      p_anchor: ELEMENT_ANCHOR,
      p_context: {},
      p_body: "@Olive Owner please look",
      p_mentions: [scenario.owner.id, scenario.member.id],
    });
    expect(created.error).toBeNull();
    const threadId = unwrap(created).id;
    const comment = unwrap(
      await scenario.admin.from("comments").select("id").eq("thread_id", threadId).single(),
    );
    expect(await notificationsFor(comment.id)).toEqual(expected([scenario.owner, "mention"]));
  });
});

describe("notifications as the recipient reads them", () => {
  it("embeds the thread, the comment and its author profile in one select", async () => {
    const thread = await newThread();
    const comment = await post(
      scenario.owner,
      thread.id,
      [scenario.member.id],
      "@Milo Member look",
    );
    const result = await scenario.member.client
      .from("notifications")
      .select(
        "id, kind, read_at, created_at, threads(page_url, status), comments(body, author_id, profiles!comments_author_id_fkey(display_name))",
      )
      .eq("comment_id", comment.id);
    expectOneRow(result);
    expect(result.data?.[0]).toMatchObject({
      kind: "mention",
      read_at: null,
      threads: { page_url: thread.page_url, status: "open" },
      comments: {
        body: "@Milo Member look",
        author_id: scenario.owner.id,
        profiles: { display_name: "Olive Owner" },
      },
    });
  });

  it("lets only the recipient see the notification", async () => {
    const thread = await newThread();
    const comment = await post(scenario.owner, thread.id, [scenario.member.id]);
    for (const reader of [scenario.owner, scenario.guest, scenario.outsider, scenario.stranger]) {
      const result = await reader.client
        .from("notifications")
        .select("id")
        .eq("comment_id", comment.id);
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
  });
});
