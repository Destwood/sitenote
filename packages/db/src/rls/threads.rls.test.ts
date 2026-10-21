import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CHECK_VIOLATION,
  ELEMENT_ANCHOR,
  TEXT_ANCHOR,
  buildThread,
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

async function threadOf(id: string) {
  return unwrap(await scenario.admin.from("threads").select("*").eq("id", id).single());
}

async function threadExists(id: string): Promise<boolean> {
  const result = await scenario.admin.from("threads").select("id").eq("id", id);
  expect(result.error).toBeNull();
  return (result.data?.length ?? 0) > 0;
}

describe("threads select", () => {
  it("is visible to the owner, a member and a guest", async () => {
    const thread = await insertThread(scenario.admin, scenario.site, scenario.member.id);
    for (const reader of [scenario.owner, scenario.member, scenario.guest]) {
      expectOneRow(await reader.client.from("threads").select("id, anchor").eq("id", thread.id));
    }
  });

  it("is invisible to an outsider and to an anonymous non-member", async () => {
    const thread = await insertThread(scenario.admin, scenario.site, scenario.member.id);
    for (const reader of [scenario.outsider, scenario.stranger]) {
      expectNoRows(await reader.client.from("threads").select("id").eq("id", thread.id));
      expectNoRows(
        await reader.client.from("threads").select("id").eq("workspace_id", scenario.workspaceId),
      );
    }
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(await createPublicClient().from("threads").select("id"));
  });
});

describe("threads insert", () => {
  it("lets the owner, a member and a guest create their own open thread", async () => {
    for (const actor of [scenario.owner, scenario.member, scenario.guest]) {
      const payload = buildThread(scenario.site, actor.id, { anchor: TEXT_ANCHOR });
      const result = await actor.client
        .from("threads")
        .insert(payload)
        .select("id, status, created_by, resolved_by, resolved_at");
      expectOneRow(result);
      expect(result.data?.[0]).toEqual({
        id: payload.id,
        status: "open",
        created_by: actor.id,
        resolved_by: null,
        resolved_at: null,
      });
    }
  });

  it("derives workspace_id from the site when it is omitted", async () => {
    const payload = buildThread(scenario.site, scenario.member.id);
    const { workspace_id: omitted, ...withoutWorkspace } = payload;
    expect(omitted).toBe(scenario.workspaceId);
    const result = await scenario.member.client
      .from("threads")
      .insert(withoutWorkspace as typeof payload)
      .select("workspace_id");
    expectOneRow(result);
    expect(result.data?.[0]?.workspace_id).toBe(scenario.workspaceId);
  });

  it("denies an outsider and an anonymous non-member", async () => {
    for (const actor of [scenario.outsider, scenario.stranger]) {
      expectRlsViolation(
        await actor.client.from("threads").insert(buildThread(scenario.site, actor.id)),
      );
    }
  });

  it("denies a thread attributed to somebody else", async () => {
    expectRlsViolation(
      await scenario.guest.client
        .from("threads")
        .insert(buildThread(scenario.site, scenario.owner.id)),
    );
  });

  it("denies creating a thread that is already resolved", async () => {
    expectRlsViolation(
      await scenario.member.client
        .from("threads")
        .insert(buildThread(scenario.site, scenario.member.id, { status: "resolved" })),
    );
  });

  it("denies setting resolution or ClickUp fields at creation", async () => {
    const forged = [
      { resolved_by: scenario.member.id },
      { resolved_at: new Date().toISOString() },
      { clickup_task_id: "86abc" },
      { clickup_task_url: "https://app.clickup.com/t/86abc" },
      { created_at: "2000-01-01T00:00:00Z" },
    ];
    for (const overrides of forged) {
      expectPermissionDenied(
        await scenario.member.client
          .from("threads")
          .insert(buildThread(scenario.site, scenario.member.id, overrides)),
      );
    }
  });

  it("denies planting a thread in a workspace the user does not belong to", async () => {
    const intoOther = buildThread(scenario.otherSite, scenario.member.id);
    expectRlsViolation(await scenario.member.client.from("threads").insert(intoOther));
    const { workspace_id: omitted, ...withoutWorkspace } = intoOther;
    expect(omitted).toBe(scenario.otherWorkspaceId);
    expectRlsViolation(
      await scenario.member.client.from("threads").insert(withoutWorkspace as typeof intoOther),
    );
  });

  it("rejects a site that does not belong to the stated workspace", async () => {
    const mismatched = buildThread(scenario.otherSite, scenario.member.id, {
      workspace_id: scenario.workspaceId,
    });
    expectCheckViolation(
      await scenario.member.client.from("threads").insert(mismatched),
      /site does not belong to the workspace/,
    );
    expectCheckViolation(
      await scenario.admin.from("threads").insert(mismatched),
      /site does not belong to the workspace/,
    );
  });

  it("rejects an unknown site", async () => {
    expectCheckViolation(
      await scenario.member.client
        .from("threads")
        .insert(buildThread(scenario.site, scenario.member.id, { site_id: randomUUID() })),
      /site does not belong to the workspace/,
    );
  });

  it("rejects page urls outside the site origin or with a dangerous scheme", async () => {
    const urls = [
      "https://evil.example/phish",
      "javascript:alert(1)",
      `${scenario.site.origin}.evil.example/path`,
      `${scenario.site.origin}@evil.example/`,
      "data:text/html,hi",
    ];
    for (const page_url of urls) {
      expectCode(
        await scenario.member.client
          .from("threads")
          .insert(buildThread(scenario.site, scenario.member.id, { page_url })),
        CHECK_VIOLATION,
      );
    }
    for (const page_url of [scenario.site.origin, `${scenario.site.origin}/a/b`]) {
      expectOneRow(
        await scenario.member.client
          .from("threads")
          .insert(buildThread(scenario.site, scenario.member.id, { page_url }))
          .select("id"),
      );
    }
  });

  it("rejects malformed anchors and oversized json", async () => {
    for (const anchor of [[], "text", { kind: "other" }, { nokind: true }]) {
      expectCode(
        await scenario.member.client
          .from("threads")
          .insert(buildThread(scenario.site, scenario.member.id, { anchor })),
        CHECK_VIOLATION,
      );
    }
    expectCode(
      await scenario.member.client
        .from("threads")
        .insert(buildThread(scenario.site, scenario.member.id, { anchor: null as never })),
      "23502",
    );
    expectCode(
      await scenario.member.client.from("threads").insert(
        buildThread(scenario.site, scenario.member.id, {
          anchor: { ...(ELEMENT_ANCHOR as object), padding: "x".repeat(40000) },
        }),
      ),
      CHECK_VIOLATION,
    );
    expectCode(
      await scenario.member.client.from("threads").insert(
        buildThread(scenario.site, scenario.member.id, {
          context: { errors: "x".repeat(70000) },
        }),
      ),
      CHECK_VIOLATION,
    );
    expectCode(
      await scenario.member.client
        .from("threads")
        .insert(buildThread(scenario.site, scenario.member.id, { context: [] })),
      CHECK_VIOLATION,
    );
  });

  it("only accepts a screenshot path inside the thread's own workspace folder", async () => {
    const id = randomUUID();
    const own = `${scenario.workspaceId}/${id}.png`;
    expectOneRow(
      await scenario.member.client
        .from("threads")
        .insert(buildThread(scenario.site, scenario.member.id, { id, screenshot_path: own }))
        .select("id"),
    );
    const rejected = [
      { id, path: `${scenario.otherWorkspaceId}/${id}.png` },
      { id: randomUUID(), path: `${scenario.otherWorkspaceId}/${randomUUID()}.png` },
      { id: randomUUID(), path: `${scenario.workspaceId}/${randomUUID()}.png` },
      { id, path: `${scenario.workspaceId}/${id}/../${id}.png` },
      { id, path: `../${scenario.workspaceId}/${id}.png` },
      { id, path: `${scenario.workspaceId}/${id}.svg` },
    ];
    for (const candidate of rejected) {
      expectCode(
        await scenario.member.client.from("threads").insert(
          buildThread(scenario.site, scenario.member.id, {
            id: candidate.id,
            screenshot_path: candidate.path,
          }),
        ),
        CHECK_VIOLATION,
      );
    }
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(
      await createPublicClient()
        .from("threads")
        .insert(buildThread(scenario.site, scenario.member.id)),
    );
  });
});

describe("threads update", () => {
  it("lets the owner and a member resolve and reopen any thread", async () => {
    for (const actor of [scenario.owner, scenario.member]) {
      const thread = await insertThread(scenario.admin, scenario.site, scenario.guest.id);
      const resolved = await actor.client
        .from("threads")
        .update({ status: "resolved" })
        .eq("id", thread.id)
        .select("status, resolved_by, resolved_at");
      expectOneRow(resolved);
      expect(resolved.data?.[0]?.status).toBe("resolved");
      expect(resolved.data?.[0]?.resolved_by).toBe(actor.id);
      expect(resolved.data?.[0]?.resolved_at).not.toBeNull();

      const reopened = await actor.client
        .from("threads")
        .update({ status: "open" })
        .eq("id", thread.id)
        .select("status, resolved_by, resolved_at");
      expectOneRow(reopened);
      expect(reopened.data?.[0]).toEqual({ status: "open", resolved_by: null, resolved_at: null });
    }
  });

  it("lets a guest resolve and reopen only their own thread", async () => {
    const own = await insertThread(scenario.admin, scenario.site, scenario.guest.id);
    const foreign = await insertThread(scenario.admin, scenario.site, scenario.member.id);

    expectOneRow(
      await scenario.guest.client
        .from("threads")
        .update({ status: "resolved" })
        .eq("id", own.id)
        .select("id"),
    );
    expect((await threadOf(own.id)).resolved_by).toBe(scenario.guest.id);
    expectOneRow(
      await scenario.guest.client
        .from("threads")
        .update({ status: "open" })
        .eq("id", own.id)
        .select("id"),
    );

    expectNoRows(
      await scenario.guest.client
        .from("threads")
        .update({ status: "resolved" })
        .eq("id", foreign.id)
        .select("id"),
    );
    expect((await threadOf(foreign.id)).status).toBe("open");
  });

  it("does not let a guest reopen a foreign thread that a member resolved", async () => {
    const thread = await insertThread(scenario.admin, scenario.site, scenario.member.id);
    await scenario.member.client.from("threads").update({ status: "resolved" }).eq("id", thread.id);
    expectNoRows(
      await scenario.guest.client
        .from("threads")
        .update({ status: "open" })
        .eq("id", thread.id)
        .select("id"),
    );
    expect((await threadOf(thread.id)).status).toBe("resolved");
  });

  it("changes nothing for an outsider or an anonymous non-member", async () => {
    const thread = await insertThread(scenario.admin, scenario.site, scenario.member.id);
    for (const actor of [scenario.outsider, scenario.stranger]) {
      expectNoRows(
        await actor.client
          .from("threads")
          .update({ status: "resolved" })
          .eq("id", thread.id)
          .select("id"),
      );
    }
    expect((await threadOf(thread.id)).status).toBe("open");
  });

  it("does not let a guest who was removed from the workspace resolve their own thread", async () => {
    const thread = await insertThread(scenario.admin, scenario.site, scenario.guest.id);
    await scenario.admin
      .from("members")
      .delete()
      .eq("user_id", scenario.guest.id)
      .eq("workspace_id", scenario.workspaceId);
    expectNoRows(
      await scenario.guest.client
        .from("threads")
        .update({ status: "resolved" })
        .eq("id", thread.id)
        .select("id"),
    );
    await scenario.admin
      .from("members")
      .insert({ workspace_id: scenario.workspaceId, user_id: scenario.guest.id, role: "guest" });
  });

  it("denies changing any column except the status", async () => {
    const thread = await insertThread(scenario.admin, scenario.site, scenario.member.id);
    const edits = [
      { created_by: scenario.owner.id },
      { workspace_id: scenario.otherWorkspaceId },
      { site_id: scenario.otherSite.id },
      { page_url: "https://evil.example/" },
      { anchor: TEXT_ANCHOR },
      { context: {} },
      { screenshot_path: `${scenario.workspaceId}/${thread.id}.png` },
      { resolved_by: scenario.owner.id },
      { resolved_at: new Date().toISOString() },
      { clickup_task_id: "86abc" },
      { clickup_task_url: "https://app.clickup.com/t/86abc" },
      { created_at: "2000-01-01T00:00:00Z" },
      { id: randomUUID() },
    ];
    for (const edit of edits) {
      expectPermissionDenied(
        await scenario.owner.client.from("threads").update(edit).eq("id", thread.id),
      );
    }
  });

  it("cannot move a thread to another workspace, even with the service role", async () => {
    const thread = await insertThread(scenario.admin, scenario.site, scenario.member.id);
    expectImmutable(
      await scenario.admin
        .from("threads")
        .update({ workspace_id: scenario.otherWorkspaceId, site_id: scenario.otherSite.id })
        .eq("id", thread.id),
    );
    expectImmutable(
      await scenario.admin
        .from("threads")
        .update({ site_id: scenario.otherSite.id })
        .eq("id", thread.id),
    );
    expectImmutable(
      await scenario.admin
        .from("threads")
        .update({ created_by: scenario.owner.id })
        .eq("id", thread.id),
    );
    const row = await threadOf(thread.id);
    expect(row.workspace_id).toBe(scenario.workspaceId);
    expect(row.site_id).toBe(scenario.site.id);
  });

  it("lets the service role attach a ClickUp task without disturbing the status", async () => {
    const thread = await insertThread(scenario.admin, scenario.site, scenario.member.id);
    await scenario.member.client.from("threads").update({ status: "resolved" }).eq("id", thread.id);
    const resolved = await threadOf(thread.id);
    const result = await scenario.admin
      .from("threads")
      .update({ clickup_task_id: "86abc", clickup_task_url: "https://app.clickup.com/t/86abc" })
      .eq("id", thread.id)
      .select("status, resolved_by, resolved_at, clickup_task_id");
    expectOneRow(result);
    expect(result.data?.[0]?.resolved_by).toBe(resolved.resolved_by);
    expect(result.data?.[0]?.resolved_at).toBe(resolved.resolved_at);
    expectCode(
      await scenario.admin
        .from("threads")
        .update({ clickup_task_url: "javascript:alert(1)" })
        .eq("id", thread.id),
      CHECK_VIOLATION,
    );
  });

  it("refreshes updated_at when the status changes", async () => {
    const thread = await insertThread(scenario.admin, scenario.site, scenario.member.id);
    await scenario.member.client.from("threads").update({ status: "resolved" }).eq("id", thread.id);
    const after = await threadOf(thread.id);
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
      new Date(thread.updated_at).getTime(),
    );
  });
});

describe("threads delete", () => {
  it("lets the owner delete a thread together with its comments", async () => {
    const thread = await insertThread(scenario.admin, scenario.site, scenario.member.id);
    const comment = await insertComment(scenario.admin, thread, scenario.member.id);
    expectOneRow(
      await scenario.owner.client.from("threads").delete().eq("id", thread.id).select("id"),
    );
    expect(await threadExists(thread.id)).toBe(false);
    expectNoRows(await scenario.admin.from("comments").select("id").eq("id", comment.id));
  });

  it("removes nothing for a member, a guest, an outsider or an anonymous non-member", async () => {
    const thread = await insertThread(scenario.admin, scenario.site, scenario.guest.id);
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectNoRows(await actor.client.from("threads").delete().eq("id", thread.id).select("id"));
    }
    expect(await threadExists(thread.id)).toBe(true);
  });
});
