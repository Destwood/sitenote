import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createScenario,
  destroyScenario,
  expectCode,
  insertComment,
  insertThread,
  unwrap,
  type Scenario,
  type TestUser,
} from "../test-harness";

const INVALID_ARGUMENT = "22023";

let scenario: Scenario;

beforeAll(async () => {
  scenario = await createScenario();
});

afterAll(async () => {
  await destroyScenario(scenario);
});

function token(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

async function threadWithComment(author: TestUser, body: string, pageToken: string) {
  const thread = await insertThread(scenario.admin, scenario.site, author.id, {
    page_url: `${scenario.site.origin}/pages/${pageToken}`,
  });
  await insertComment(scenario.admin, thread, author.id, { body });
  return thread;
}

async function search(
  actor: TestUser,
  args: Partial<{
    p_q: string;
    p_status: "open" | "resolved";
    p_author_id: string;
    p_page: string;
    p_limit: number;
    p_offset: number;
    p_site_id: string;
  }> = {},
) {
  return actor.client.rpc("search_threads", {
    p_workspace_id: scenario.workspaceId,
    ...args,
  });
}

describe("search_threads visibility", () => {
  it("returns the matching threads to the owner, a member and a guest", async () => {
    const term = token();
    const thread = await threadWithComment(scenario.member, `Hello ${term} world`, term);

    for (const reader of [scenario.owner, scenario.member, scenario.guest]) {
      const rows = unwrap(await search(reader, { p_q: term }));
      expect(rows.map((row) => row.thread_id)).toEqual([thread.id]);
      expect(rows[0]?.comment_count).toBe(1);
      expect(rows[0]?.first_body).toBe(`Hello ${term} world`);
      expect(rows[0]?.total_count).toBe(1);
    }
  });

  it("hides the workspace from an outsider and an anonymous non-member", async () => {
    const term = token();
    await threadWithComment(scenario.member, `Secret ${term}`, term);

    for (const reader of [scenario.outsider, scenario.stranger]) {
      const rows = unwrap(await search(reader, { p_q: term }));
      expect(rows).toEqual([]);
    }
  });
});

describe("search_threads filters", () => {
  it("filters by status and by author", async () => {
    const term = token();
    const openThread = await threadWithComment(scenario.member, `Open ${term}`, term);
    const resolvedThread = await threadWithComment(scenario.owner, `Resolved ${term}`, term);
    unwrap(
      await scenario.admin
        .from("threads")
        .update({ status: "resolved" })
        .eq("id", resolvedThread.id)
        .select("id")
        .single(),
    );

    const open = unwrap(await search(scenario.owner, { p_q: term, p_status: "open" }));
    expect(open.map((row) => row.thread_id)).toEqual([openThread.id]);

    const resolved = unwrap(await search(scenario.owner, { p_q: term, p_status: "resolved" }));
    expect(resolved.map((row) => row.thread_id)).toEqual([resolvedThread.id]);

    const byOwner = unwrap(
      await search(scenario.owner, { p_q: term, p_author_id: scenario.owner.id }),
    );
    expect(byOwner.map((row) => row.thread_id)).toEqual([resolvedThread.id]);
  });

  it("matches the page path by substring", async () => {
    const term = token();
    const thread = await threadWithComment(scenario.member, "Body without the term", term);

    const rows = unwrap(await search(scenario.owner, { p_page: term }));
    expect(rows.map((row) => row.thread_id)).toEqual([thread.id]);
  });

  it("treats % and _ in the query as literal characters", async () => {
    const term = token();
    const literalPercent = await threadWithComment(scenario.member, `${term}% sure`, term);
    await threadWithComment(scenario.member, `${term}z sure`, term);
    const literalUnderscore = await threadWithComment(scenario.member, `${term}_x`, term);
    await threadWithComment(scenario.member, `${term}Xx`, term);

    const percent = unwrap(await search(scenario.owner, { p_q: `${term}%` }));
    expect(percent.map((row) => row.thread_id)).toEqual([literalPercent.id]);

    const underscore = unwrap(await search(scenario.owner, { p_q: `${term}_x` }));
    expect(underscore.map((row) => row.thread_id)).toEqual([literalUnderscore.id]);
  });

  it("ignores deleted comments when searching", async () => {
    const term = token();
    const thread = await threadWithComment(scenario.member, `Removed ${term}`, term);
    unwrap(
      await scenario.admin
        .from("comments")
        .update({ body: "", deleted_at: new Date().toISOString() })
        .eq("thread_id", thread.id)
        .select("id")
        .single(),
    );

    expect(unwrap(await search(scenario.owner, { p_q: term }))).toEqual([]);
  });
});

describe("search_threads pagination", () => {
  it("returns one page and the total number of matches", async () => {
    const term = token();
    for (const index of [1, 2, 3]) {
      await threadWithComment(
        scenario.member,
        `Page ${term} ${String(index)}`,
        `${term}-${String(index)}`,
      );
    }

    const first = unwrap(await search(scenario.owner, { p_q: term, p_limit: 2, p_offset: 0 }));
    expect(first).toHaveLength(2);
    expect(first[0]?.total_count).toBe(3);

    const second = unwrap(await search(scenario.owner, { p_q: term, p_limit: 2, p_offset: 2 }));
    expect(second).toHaveLength(1);
    expect(second[0]?.total_count).toBe(3);
  });

  it.each([[0], [101]])("rejects a page size of %i", async (limit) => {
    const result = await search(scenario.owner, { p_limit: limit });

    expectCode(result, INVALID_ARGUMENT);
  });

  it("rejects a negative offset", async () => {
    const result = await search(scenario.owner, { p_offset: -1 });

    expectCode(result, INVALID_ARGUMENT);
  });
});
