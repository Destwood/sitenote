import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../database-types";
import {
  CHECK_VIOLATION,
  ELEMENT_ANCHOR,
  TEXT_ANCHOR,
  createPublicClient,
  createScenario,
  destroyScenario,
  expectCheckViolation,
  expectCode,
  expectPermissionDenied,
  expectRlsViolation,
  unwrap,
  type Scenario,
  type TestUser,
} from "../test-harness";

type CreateThreadArgs = Database["public"]["Functions"]["create_thread"]["Args"];

let scenario: Scenario;

beforeAll(async () => {
  scenario = await createScenario();
});

afterAll(async () => {
  await destroyScenario(scenario);
});

function newPageUrl(): string {
  return `${scenario.site.origin}/${randomUUID()}`;
}

function args(overrides: Partial<CreateThreadArgs> = {}): CreateThreadArgs {
  return {
    p_site_id: scenario.site.id,
    p_page_url: newPageUrl(),
    p_anchor: ELEMENT_ANCHOR,
    p_context: { viewport: { width: 1280, height: 720 } },
    p_body: "The headline wraps badly",
    p_mentions: [],
    ...overrides,
  };
}

function call(actor: Pick<TestUser, "client">, params: CreateThreadArgs) {
  return actor.client.rpc("create_thread", params);
}

async function threadsAt(pageUrl: string) {
  return unwrap(await scenario.admin.from("threads").select("id").eq("page_url", pageUrl));
}

async function commentsOf(threadId: string) {
  return unwrap(
    await scenario.admin
      .from("comments")
      .select("author_id, body, mentions, workspace_id")
      .eq("thread_id", threadId),
  );
}

describe("create_thread", () => {
  it("lets the owner, a member and a guest create a thread with its first comment", async () => {
    for (const actor of [scenario.owner, scenario.member, scenario.guest]) {
      const params = args({ p_anchor: TEXT_ANCHOR });
      const result = await call(actor, params);

      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({
        site_id: scenario.site.id,
        workspace_id: scenario.workspaceId,
        page_url: params.p_page_url,
        status: "open",
        created_by: actor.id,
        anchor: TEXT_ANCHOR,
        context: params.p_context,
      });
      const comments = await commentsOf(unwrap(result).id);
      expect(comments).toEqual([
        {
          author_id: actor.id,
          body: params.p_body,
          mentions: [],
          workspace_id: scenario.workspaceId,
        },
      ]);
    }
  });

  it("stores mentions of workspace members on the first comment", async () => {
    const result = await call(
      scenario.member,
      args({ p_mentions: [scenario.owner.id, scenario.guest.id] }),
    );

    const comments = await commentsOf(unwrap(result).id);
    expect([...(comments[0]?.mentions ?? [])].sort()).toEqual(
      [scenario.owner.id, scenario.guest.id].sort(),
    );
  });

  it("denies an outsider and an anonymous non-member and leaves nothing behind", async () => {
    for (const actor of [scenario.outsider, scenario.stranger]) {
      const params = args();
      expectRlsViolation(await call(actor, params));
      expect(await threadsAt(params.p_page_url)).toEqual([]);
    }
  });

  it("denies a site of another workspace", async () => {
    const params = args({
      p_site_id: scenario.otherSite.id,
      p_page_url: `${scenario.otherSite.origin}/x`,
    });

    expectRlsViolation(await call(scenario.member, params));
    expect(await threadsAt(params.p_page_url)).toEqual([]);
  });

  it("denies the unauthenticated role", async () => {
    const params = args();
    const result = await call({ client: createPublicClient() }, params);

    expectPermissionDenied(result);
    expect(await threadsAt(params.p_page_url)).toEqual([]);
  });

  it("rejects an empty or whitespace-only body and leaves nothing behind", async () => {
    for (const p_body of ["", "   ", "\n\t \n"]) {
      const params = args({ p_body });
      expectCheckViolation(await call(scenario.member, params), /must not be empty/);
      expect(await threadsAt(params.p_page_url)).toEqual([]);
    }
  });

  it("rolls the thread back when the first comment fails", async () => {
    const mentionsAnOutsider = args({ p_mentions: [scenario.outsider.id] });
    expectCheckViolation(
      await call(scenario.member, mentionsAnOutsider),
      /mentions must be members/,
    );
    expect(await threadsAt(mentionsAnOutsider.p_page_url)).toEqual([]);

    const tooLong = args({ p_body: "x".repeat(10001) });
    expectCode(await call(scenario.member, tooLong), CHECK_VIOLATION);
    expect(await threadsAt(tooLong.p_page_url)).toEqual([]);
  });

  it("rejects a bad anchor, a foreign page url and an unknown site without a partial write", async () => {
    const badAnchor = args({ p_anchor: { kind: "other" } });
    expectCode(await call(scenario.member, badAnchor), CHECK_VIOLATION);
    expect(await threadsAt(badAnchor.p_page_url)).toEqual([]);

    const foreignUrl = args({ p_page_url: "https://evil.example/phish" });
    expectCode(await call(scenario.member, foreignUrl), CHECK_VIOLATION);
    expect(await threadsAt(foreignUrl.p_page_url)).toEqual([]);

    const unknownSite = args({ p_site_id: randomUUID() });
    expectCode(await call(scenario.member, unknownSite), CHECK_VIOLATION);
    expect(await threadsAt(unknownSite.p_page_url)).toEqual([]);
  });

  it("always attributes the thread and the comment to the caller", async () => {
    const params = args();
    const result = await call(scenario.guest, params);

    const created = unwrap(result);
    expect(created.created_by).toBe(scenario.guest.id);
    expect((await commentsOf(created.id))[0]?.author_id).toBe(scenario.guest.id);
  });
});
