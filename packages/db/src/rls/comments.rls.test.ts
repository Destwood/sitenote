import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CHECK_VIOLATION,
  createPublicClient,
  createScenario,
  destroyScenario,
  expectCheckViolation,
  expectCode,
  expectImmutable,
  expectNoRows,
  expectOneRow,
  expectPermissionDenied,
  expectRlsViolation,
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

async function newThread() {
  return insertThread(scenario.admin, scenario.site, scenario.owner.id);
}

async function commentOf(id: string) {
  return unwrap(await scenario.admin.from("comments").select("*").eq("id", id).single());
}

describe("comments select", () => {
  it("is visible to the owner, a member and a guest", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.member.id);
    for (const reader of [scenario.owner, scenario.member, scenario.guest]) {
      expectOneRow(await reader.client.from("comments").select("id, body").eq("id", comment.id));
    }
  });

  it("is invisible to an outsider and to an anonymous non-member", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.member.id);
    for (const reader of [scenario.outsider, scenario.stranger]) {
      expectNoRows(await reader.client.from("comments").select("id").eq("id", comment.id));
      expectNoRows(await reader.client.from("comments").select("id").eq("thread_id", thread.id));
    }
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(await createPublicClient().from("comments").select("id"));
  });
});

describe("comments insert", () => {
  it("lets the owner, a member and a guest comment as themselves", async () => {
    const thread = await newThread();
    for (const actor of [scenario.owner, scenario.member, scenario.guest]) {
      const result = await actor.client
        .from("comments")
        .insert({
          thread_id: thread.id,
          workspace_id: scenario.workspaceId,
          author_id: actor.id,
          body: `Hello from ${actor.id}`,
        })
        .select("author_id, workspace_id, edited_at, deleted_at, mentions");
      expectOneRow(result);
      expect(result.data?.[0]).toEqual({
        author_id: actor.id,
        workspace_id: scenario.workspaceId,
        edited_at: null,
        deleted_at: null,
        mentions: [],
      });
    }
  });

  it("derives workspace_id from the thread when it is omitted", async () => {
    const thread = await newThread();
    const payload = {
      thread_id: thread.id,
      author_id: scenario.member.id,
      body: "No workspace given",
    };
    const result = await scenario.member.client
      .from("comments")
      .insert(payload as typeof payload & { workspace_id: string })
      .select("workspace_id");
    expectOneRow(result);
    expect(result.data?.[0]?.workspace_id).toBe(scenario.workspaceId);
  });

  it("denies an outsider and an anonymous non-member", async () => {
    const thread = await newThread();
    for (const actor of [scenario.outsider, scenario.stranger]) {
      expectRlsViolation(
        await actor.client.from("comments").insert({
          thread_id: thread.id,
          workspace_id: scenario.workspaceId,
          author_id: actor.id,
          body: "Let me in",
        }),
      );
    }
  });

  it("denies a comment attributed to somebody else", async () => {
    const thread = await newThread();
    expectRlsViolation(
      await scenario.guest.client.from("comments").insert({
        thread_id: thread.id,
        workspace_id: scenario.workspaceId,
        author_id: scenario.owner.id,
        body: "Forged by the guest",
      }),
    );
  });

  it("denies commenting on a thread of another workspace", async () => {
    const foreign = await insertThread(scenario.admin, scenario.otherSite, scenario.outsider.id);
    expectCheckViolation(
      await scenario.member.client.from("comments").insert({
        thread_id: foreign.id,
        workspace_id: scenario.workspaceId,
        author_id: scenario.member.id,
        body: "Cross-workspace",
      }),
      /thread does not belong to the workspace/,
    );
    const payload = {
      thread_id: foreign.id,
      author_id: scenario.member.id,
      body: "Cross-workspace without workspace_id",
    };
    expectRlsViolation(
      await scenario.member.client
        .from("comments")
        .insert(payload as typeof payload & { workspace_id: string }),
    );
    expectRlsViolation(
      await scenario.member.client.from("comments").insert({
        thread_id: foreign.id,
        workspace_id: scenario.otherWorkspaceId,
        author_id: scenario.member.id,
        body: "Claiming the other workspace",
      }),
    );
  });

  it("rejects an unknown thread", async () => {
    expectCheckViolation(
      await scenario.member.client.from("comments").insert({
        thread_id: randomUUID(),
        workspace_id: scenario.workspaceId,
        author_id: scenario.member.id,
        body: "Nobody home",
      }),
      /thread does not belong to the workspace/,
    );
  });

  it("accepts mentions of workspace members and rejects anybody else", async () => {
    const thread = await newThread();
    const accepted = await scenario.member.client
      .from("comments")
      .insert({
        thread_id: thread.id,
        workspace_id: scenario.workspaceId,
        author_id: scenario.member.id,
        body: "@owner @guest",
        mentions: [scenario.owner.id, scenario.guest.id],
      })
      .select("mentions");
    expectOneRow(accepted);
    for (const mentions of [
      [scenario.outsider.id],
      [scenario.owner.id, randomUUID()],
      [scenario.stranger.id],
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

  it("rejects empty, whitespace-only and oversized bodies and too many mentions", async () => {
    const thread = await newThread();
    for (const body of ["", "   \n\t", "x".repeat(10001)]) {
      expectCode(
        await scenario.member.client.from("comments").insert({
          thread_id: thread.id,
          workspace_id: scenario.workspaceId,
          author_id: scenario.member.id,
          body,
        }),
        CHECK_VIOLATION,
      );
    }
    expectOneRow(
      await scenario.member.client
        .from("comments")
        .insert({
          thread_id: thread.id,
          workspace_id: scenario.workspaceId,
          author_id: scenario.member.id,
          body: "x".repeat(10000),
        })
        .select("id"),
    );
    expectCode(
      await scenario.member.client.from("comments").insert({
        thread_id: thread.id,
        workspace_id: scenario.workspaceId,
        author_id: scenario.member.id,
        body: "many",
        mentions: Array.from({ length: 51 }, () => scenario.owner.id),
      }),
      CHECK_VIOLATION,
    );
  });

  it("denies setting edited_at, deleted_at or created_at at creation", async () => {
    const thread = await newThread();
    for (const extra of [
      { edited_at: new Date().toISOString() },
      { deleted_at: new Date().toISOString() },
      { created_at: "2000-01-01T00:00:00Z" },
    ]) {
      expectPermissionDenied(
        await scenario.member.client.from("comments").insert({
          thread_id: thread.id,
          workspace_id: scenario.workspaceId,
          author_id: scenario.member.id,
          body: "Backdated",
          ...extra,
        }),
      );
    }
  });

  it("denies the unauthenticated role", async () => {
    const thread = await newThread();
    expectPermissionDenied(
      await createPublicClient().from("comments").insert({
        thread_id: thread.id,
        workspace_id: scenario.workspaceId,
        author_id: scenario.member.id,
        body: "Anonymous key",
      }),
    );
  });
});

describe("comments update", () => {
  it("lets the author edit the body and records edited_at", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.member.id);
    expect(comment.edited_at).toBeNull();
    const result = await scenario.member.client
      .from("comments")
      .update({ body: "Edited body" })
      .eq("id", comment.id)
      .select("body, edited_at");
    expectOneRow(result);
    expect(result.data?.[0]?.body).toBe("Edited body");
    expect(result.data?.[0]?.edited_at).not.toBeNull();
  });

  it("does not stamp edited_at when the body is unchanged", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.member.id, {
      body: "Same",
    });
    await scenario.member.client
      .from("comments")
      .update({ body: "Same", mentions: [scenario.owner.id] })
      .eq("id", comment.id);
    const row = await commentOf(comment.id);
    expect(row.edited_at).toBeNull();
    expect(row.mentions).toEqual([scenario.owner.id]);
  });

  it("lets a guest edit their own comment", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.guest.id);
    expectOneRow(
      await scenario.guest.client
        .from("comments")
        .update({ body: "Guest edit" })
        .eq("id", comment.id)
        .select("id"),
    );
  });

  it("does not let anybody else edit it, owner included", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.member.id, {
      body: "Original",
    });
    for (const actor of [scenario.owner, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectNoRows(
        await actor.client
          .from("comments")
          .update({ body: "Tampered" })
          .eq("id", comment.id)
          .select("id"),
      );
      expectNoRows(
        await actor.client
          .from("comments")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", comment.id)
          .select("id"),
      );
    }
    const row = await commentOf(comment.id);
    expect(row.body).toBe("Original");
    expect(row.deleted_at).toBeNull();
  });

  it("stops the author editing once they are no longer a member", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.member.id, {
      body: "Before leaving",
    });
    await scenario.admin
      .from("members")
      .delete()
      .eq("workspace_id", scenario.workspaceId)
      .eq("user_id", scenario.member.id);
    expectNoRows(
      await scenario.member.client
        .from("comments")
        .update({ body: "After leaving" })
        .eq("id", comment.id)
        .select("id"),
    );
    expectNoRows(await scenario.member.client.from("comments").select("id").eq("id", comment.id));
    await scenario.admin.from("members").insert({
      workspace_id: scenario.workspaceId,
      user_id: scenario.member.id,
      role: "member",
    });
    expect((await commentOf(comment.id)).body).toBe("Before leaving");
  });

  it("denies changing the author, thread, workspace or timestamps", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.member.id);
    const otherThread = await newThread();
    const edits = [
      { author_id: scenario.owner.id },
      { thread_id: otherThread.id },
      { workspace_id: scenario.otherWorkspaceId },
      { edited_at: new Date().toISOString() },
      { created_at: "2000-01-01T00:00:00Z" },
      { id: randomUUID() },
    ];
    for (const edit of edits) {
      expectPermissionDenied(
        await scenario.member.client.from("comments").update(edit).eq("id", comment.id),
      );
    }
  });

  it("cannot move a comment to another thread or workspace, even with the service role", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.member.id);
    const foreign = await insertThread(scenario.admin, scenario.otherSite, scenario.outsider.id);
    expectImmutable(
      await scenario.admin.from("comments").update({ thread_id: foreign.id }).eq("id", comment.id),
    );
    expectImmutable(
      await scenario.admin
        .from("comments")
        .update({ workspace_id: scenario.otherWorkspaceId })
        .eq("id", comment.id),
    );
    expectImmutable(
      await scenario.admin
        .from("comments")
        .update({ author_id: scenario.owner.id })
        .eq("id", comment.id),
    );
  });

  it("validates mentions when they change", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.member.id);
    expectCheckViolation(
      await scenario.member.client
        .from("comments")
        .update({ mentions: [scenario.outsider.id] })
        .eq("id", comment.id),
      /mentions must be members/,
    );
    expectOneRow(
      await scenario.member.client
        .from("comments")
        .update({ mentions: [scenario.owner.id] })
        .eq("id", comment.id)
        .select("id"),
    );
  });

  it("rejects blanking the body of a live comment", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.member.id);
    expectCode(
      await scenario.member.client.from("comments").update({ body: "  " }).eq("id", comment.id),
      CHECK_VIOLATION,
    );
  });
});

describe("comments soft delete", () => {
  it("blanks the body and mentions, stamps deleted_at on the server and keeps the row", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.member.id, {
      body: "Secret that should vanish",
      mentions: [scenario.owner.id],
    });
    const forgedTime = "2001-01-01T00:00:00Z";
    const result = await scenario.member.client
      .from("comments")
      .update({ deleted_at: forgedTime })
      .eq("id", comment.id)
      .select("body, mentions, deleted_at, edited_at");
    expectOneRow(result);
    const row = result.data?.[0];
    expect(row?.body).toBe("");
    expect(row?.mentions).toEqual([]);
    expect(row?.edited_at).toBeNull();
    expect(new Date(row?.deleted_at ?? 0).getFullYear()).toBeGreaterThan(2001);
    expect((await commentOf(comment.id)).body).toBe("");
  });

  it("ignores a body sent together with the deletion", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.member.id);
    await scenario.member.client
      .from("comments")
      .update({ deleted_at: new Date().toISOString(), body: "still here?" })
      .eq("id", comment.id);
    expect((await commentOf(comment.id)).body).toBe("");
  });

  it("forbids restoring or editing a deleted comment", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.member.id);
    await scenario.member.client
      .from("comments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", comment.id);
    expectCheckViolation(
      await scenario.member.client
        .from("comments")
        .update({ deleted_at: null, body: "back from the dead" })
        .eq("id", comment.id),
      /deleted comments are read-only/,
    );
    expectCheckViolation(
      await scenario.member.client.from("comments").update({ body: "edit" }).eq("id", comment.id),
      /deleted comments are read-only/,
    );
    expectCheckViolation(
      await scenario.admin.from("comments").update({ deleted_at: null }).eq("id", comment.id),
      /deleted comments are read-only/,
    );
    expect((await commentOf(comment.id)).deleted_at).not.toBeNull();
  });
});

describe("comments delete", () => {
  it("cannot be hard-deleted by any client role", async () => {
    const thread = await newThread();
    const comment = await insertComment(scenario.admin, thread, scenario.member.id);
    for (const actor of [
      scenario.owner,
      scenario.member,
      scenario.guest,
      scenario.outsider,
      scenario.stranger,
    ]) {
      expectPermissionDenied(await actor.client.from("comments").delete().eq("id", comment.id));
    }
    expectPermissionDenied(
      await createPublicClient().from("comments").delete().eq("id", comment.id),
    );
    expect((await commentOf(comment.id)).id).toBe(comment.id);
  });
});
