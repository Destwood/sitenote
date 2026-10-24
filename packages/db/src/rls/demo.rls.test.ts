import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ELEMENT_ANCHOR,
  createAnonymousTestUser,
  createScenario,
  destroyScenario,
  expectCode,
  expectOneRow,
  expectPermissionDenied,
  unwrap,
  withDb,
  type Scenario,
  type TestUser,
} from "../test-harness";

const DEMO_WORKSPACE_ID = "00000000-0000-4000-8000-00000000d3e0";
const DEMO_OWNER_ID = "00000000-0000-4000-8000-00000000d3e1";
const INVALID_PARAMETER = "22023";
const PERMISSION_DENIED = "42501";
const RATE_LIMITED = "P0001";
const SEEDED_THREADS_PER_SITE = 4;

let scenario: Scenario;

beforeAll(async () => {
  scenario = await createScenario();
});

afterAll(async () => {
  await destroyScenario(scenario);
});

async function visitor(): Promise<TestUser> {
  const user = await createAnonymousTestUser();
  scenario.users.push(user);
  return user;
}

async function joinedVisitor(name = "Dana"): Promise<TestUser> {
  const user = await visitor();
  unwrap(await user.client.rpc("join_demo", { p_display_name: name }));
  return user;
}

function localOrigin(): string {
  const port = 10_000 + Math.floor(Math.random() * 50_000);
  return `http://127.0.0.1:${String(port)}`;
}

async function siteFor(user: TestUser, origin: string): Promise<string> {
  const rows = unwrap(await user.client.rpc("demo_site", { p_origin: origin }));
  const row = rows[0];
  if (row === undefined) {
    throw new Error("demo_site returned no site");
  }
  return row.site_id;
}

function threadArguments(siteId: string, origin: string, mentions: string[] = []) {
  return {
    p_site_id: siteId,
    p_page_url: `${origin}/pricing`,
    p_anchor: ELEMENT_ANCHOR,
    p_context: {},
    p_body: "A note from the visitor",
    p_mentions: mentions,
  };
}

describe("join_demo", () => {
  it("adds an anonymous visitor as a guest with a trimmed display name", async () => {
    const user = await visitor();
    const result = await user.client.rpc("join_demo", { p_display_name: "  Dana  " });
    expectOneRow(result);
    expect(unwrap(result)[0]).toEqual({ workspace_id: DEMO_WORKSPACE_ID });

    const members = unwrap(
      await scenario.admin
        .from("members")
        .select("role")
        .eq("workspace_id", DEMO_WORKSPACE_ID)
        .eq("user_id", user.id),
    );
    expect(members).toEqual([{ role: "guest" }]);

    const profile = unwrap(
      await scenario.admin.from("profiles").select("display_name").eq("user_id", user.id).single(),
    );
    expect(profile.display_name).toBe("Dana");
  });

  it("keeps the guest role and one membership when a visitor joins again", async () => {
    const user = await joinedVisitor("Repeat");
    unwrap(await user.client.rpc("join_demo", { p_display_name: "Repeat Again" }));
    const members = unwrap(
      await scenario.admin
        .from("members")
        .select("role")
        .eq("workspace_id", DEMO_WORKSPACE_ID)
        .eq("user_id", user.id),
    );
    expect(members).toEqual([{ role: "guest" }]);
  });

  it("refuses a registered user", async () => {
    const result = await scenario.member.client.rpc("join_demo", { p_display_name: "Milo" });
    expectCode(result, PERMISSION_DENIED);
  });

  it("refuses a blank name and a name over 40 characters, and accepts 40", async () => {
    const user = await visitor();
    expectCode(await user.client.rpc("join_demo", { p_display_name: "   " }), INVALID_PARAMETER);
    expectCode(
      await user.client.rpc("join_demo", { p_display_name: "a".repeat(41) }),
      INVALID_PARAMETER,
    );
    expectOneRow(await user.client.rpc("join_demo", { p_display_name: "a".repeat(40) }));
  });
});

describe("demo_site", () => {
  it("registers a local origin for a joined guest and returns the same site again", async () => {
    const user = await joinedVisitor();
    const origin = localOrigin();
    const siteId = await siteFor(user, origin);
    expect(await siteFor(user, origin)).toBe(siteId);

    const site = unwrap(
      await scenario.admin.from("sites").select("workspace_id, origin").eq("id", siteId).single(),
    );
    expect(site).toEqual({ workspace_id: DEMO_WORKSPACE_ID, origin });
  });

  it("seeds four threads by the demo owner when the site is created", async () => {
    const user = await joinedVisitor();
    const origin = localOrigin();
    const siteId = await siteFor(user, origin);
    const threads = unwrap(
      await scenario.admin
        .from("threads")
        .select("created_by, page_url, comments(author_id)")
        .eq("site_id", siteId),
    );
    expect(threads).toHaveLength(SEEDED_THREADS_PER_SITE);
    for (const thread of threads) {
      expect(thread.created_by).toBe(DEMO_OWNER_ID);
      expect(thread.page_url).toBe(`${origin}/demo`);
      expect(thread.comments.map((comment) => comment.author_id)).toEqual([DEMO_OWNER_ID]);
    }
  });

  it("refuses an origin outside the allow-list", async () => {
    const user = await joinedVisitor();
    expectCode(
      await user.client.rpc("demo_site", { p_origin: "https://example.com" }),
      INVALID_PARAMETER,
    );
    expectCode(
      await user.client.rpc("demo_site", { p_origin: "https://localhost.example.com" }),
      INVALID_PARAMETER,
    );
  });

  it("refuses a visitor who has not joined the demo", async () => {
    const user = await visitor();
    expectCode(await user.client.rpc("demo_site", { p_origin: localOrigin() }), PERMISSION_DENIED);
  });

  it("refuses a registered user who is not a member of the demo", async () => {
    expectCode(
      await scenario.member.client.rpc("demo_site", { p_origin: localOrigin() }),
      PERMISSION_DENIED,
    );
  });
});

describe("demo rate limits and notifications", () => {
  it("allows ten threads per hour and refuses the eleventh", async () => {
    const user = await joinedVisitor();
    const origin = localOrigin();
    const siteId = await siteFor(user, origin);
    for (let index = 0; index < 10; index += 1) {
      unwrap(await user.client.rpc("create_thread", threadArguments(siteId, origin)));
    }
    const eleventh = await user.client.rpc("create_thread", threadArguments(siteId, origin));
    expectCode(eleventh, RATE_LIMITED);
    expect(eleventh.error?.message).toMatch(/demo_rate_limited/);
  });

  it("allows thirty comments per hour and refuses the thirty-first", async () => {
    const user = await joinedVisitor();
    const origin = localOrigin();
    const siteId = await siteFor(user, origin);
    const created = unwrap(await user.client.rpc("create_thread", threadArguments(siteId, origin)));
    for (let index = 1; index < 30; index += 1) {
      unwrap(
        await user.client
          .from("comments")
          .insert({
            thread_id: created.id,
            workspace_id: DEMO_WORKSPACE_ID,
            author_id: user.id,
            body: `Reply ${String(index)}`,
          })
          .select("id")
          .single(),
      );
    }
    const thirtyFirst = await user.client.from("comments").insert({
      thread_id: created.id,
      workspace_id: DEMO_WORKSPACE_ID,
      author_id: user.id,
      body: "One too many",
    });
    expectCode(thirtyFirst, RATE_LIMITED);
  });

  it("creates no notifications for comments in the demo workspace, even with mentions", async () => {
    const user = await joinedVisitor();
    const origin = localOrigin();
    const siteId = await siteFor(user, origin);
    const created = unwrap(
      await user.client.rpc("create_thread", threadArguments(siteId, origin, [DEMO_OWNER_ID])),
    );
    const rows = unwrap(
      await scenario.admin.from("notifications").select("id").eq("thread_id", created.id),
    );
    expect(rows).toEqual([]);
  });
});

describe("reset_demo", () => {
  it("is callable by the service role only", async () => {
    const user = await joinedVisitor();
    expectPermissionDenied(await user.client.rpc("reset_demo"));
  });

  it("removes visitor threads and stale guests, restores the seeded threads and keeps recent guests", async () => {
    const stale = await joinedVisitor("Stale");
    const recent = await joinedVisitor("Recent");
    const origin = localOrigin();
    const siteId = await siteFor(recent, origin);
    const visitorThread = unwrap(
      await recent.client.rpc("create_thread", threadArguments(siteId, origin)),
    );

    unwrap(
      await scenario.admin
        .from("members")
        .update({ created_at: new Date(Date.now() - 25 * 3_600_000).toISOString() })
        .eq("workspace_id", DEMO_WORKSPACE_ID)
        .eq("user_id", stale.id)
        .select("id")
        .single(),
    );

    const reset = await scenario.admin.rpc("reset_demo");
    expect(reset.error).toBeNull();

    const threads = unwrap(
      await scenario.admin.from("threads").select("id, created_by").eq("site_id", siteId),
    );
    expect(threads).toHaveLength(SEEDED_THREADS_PER_SITE);
    expect(threads.map((thread) => thread.id)).not.toContain(visitorThread.id);
    expect(threads.every((thread) => thread.created_by === DEMO_OWNER_ID)).toBe(true);

    const members = unwrap(
      await scenario.admin.from("members").select("user_id").eq("workspace_id", DEMO_WORKSPACE_ID),
    );
    const memberIds = members.map((member) => member.user_id);
    expect(memberIds).toContain(DEMO_OWNER_ID);
    expect(memberIds).toContain(recent.id);
    expect(memberIds).not.toContain(stale.id);
  });
});

describe("demo reset schedule", () => {
  it("schedules the daily reset once at 03:17 UTC", async () => {
    const rows = await withDb((db) =>
      db.query<{ schedule: string; command: string }>(
        "select schedule, command from cron.job where jobname = 'sitenote-demo-reset'",
      ),
    );
    expect(rows.rows).toEqual([{ schedule: "17 3 * * *", command: "select public.reset_demo()" }]);
  });
});
