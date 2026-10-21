import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CHECK_VIOLATION,
  UNIQUE_VIOLATION,
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
  insertSite,
  insertThread,
  randomOrigin,
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

async function siteExists(id: string): Promise<boolean> {
  const result = await scenario.admin.from("sites").select("id").eq("id", id);
  expect(result.error).toBeNull();
  return (result.data?.length ?? 0) > 0;
}

describe("sites select", () => {
  it("is visible to the owner, a member and a guest", async () => {
    for (const reader of [scenario.owner, scenario.member, scenario.guest]) {
      expectOneRow(
        await reader.client.from("sites").select("id, origin").eq("id", scenario.site.id),
      );
    }
  });

  it("is invisible to an outsider and to an anonymous non-member", async () => {
    for (const reader of [scenario.outsider, scenario.stranger]) {
      expectNoRows(await reader.client.from("sites").select("id").eq("id", scenario.site.id));
    }
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(await createPublicClient().from("sites").select("id"));
  });
});

describe("sites insert", () => {
  it("lets the owner and a member register a site", async () => {
    for (const actor of [scenario.owner, scenario.member]) {
      const result = await actor.client
        .from("sites")
        .insert({ workspace_id: scenario.workspaceId, origin: randomOrigin() })
        .select("id, origin");
      expectOneRow(result);
    }
  });

  it("denies a guest, an outsider and an anonymous non-member", async () => {
    for (const actor of [scenario.guest, scenario.outsider, scenario.stranger]) {
      expectRlsViolation(
        await actor.client
          .from("sites")
          .insert({ workspace_id: scenario.workspaceId, origin: randomOrigin() }),
      );
    }
  });

  it("rejects the same origin twice in one workspace but allows it in another", async () => {
    const origin = randomOrigin();
    expectOneRow(
      await scenario.owner.client
        .from("sites")
        .insert({ workspace_id: scenario.workspaceId, origin })
        .select("id"),
    );
    expectCode(
      await scenario.member.client
        .from("sites")
        .insert({ workspace_id: scenario.workspaceId, origin }),
      UNIQUE_VIOLATION,
    );
    expectOneRow(
      await scenario.outsider.client
        .from("sites")
        .insert({ workspace_id: scenario.otherWorkspaceId, origin })
        .select("id"),
    );
  });

  it("rejects values that are not a bare lowercase http(s) origin", async () => {
    const invalid = [
      "https://example.com/path",
      "https://example.com/",
      "https://example.com?x=1",
      "https://example.com#frag",
      "https://user@example.com",
      "https://Example.com",
      "https://exa mple.com",
      "ftp://example.com",
      "javascript:alert(1)",
      "example.com",
      "https://",
      `https://${"a".repeat(300)}.com`,
    ];
    for (const origin of invalid) {
      expectCode(
        await scenario.owner.client
          .from("sites")
          .insert({ workspace_id: scenario.workspaceId, origin }),
        CHECK_VIOLATION,
      );
    }
    for (const origin of [
      "http://localhost:4173",
      "http://127.0.0.1:4173",
      "https://a.b.example",
    ]) {
      expectOneRow(
        await scenario.owner.client
          .from("sites")
          .insert({ workspace_id: scenario.workspaceId, origin })
          .select("id"),
      );
    }
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(
      await createPublicClient()
        .from("sites")
        .insert({ workspace_id: scenario.workspaceId, origin: randomOrigin() }),
    );
  });
});

describe("sites update", () => {
  it("lets the owner change the origin of a site without threads", async () => {
    const site = await insertSite(scenario.admin, scenario.workspaceId);
    const origin = randomOrigin();
    const result = await scenario.owner.client
      .from("sites")
      .update({ origin })
      .eq("id", site.id)
      .select("origin");
    expectOneRow(result);
    expect(result.data?.[0]?.origin).toBe(origin);
  });

  it("refuses to change the origin once threads exist", async () => {
    const site = await insertSite(scenario.admin, scenario.workspaceId);
    await insertThread(scenario.admin, site, scenario.owner.id);
    expectCheckViolation(
      await scenario.owner.client
        .from("sites")
        .update({ origin: randomOrigin() })
        .eq("id", site.id),
      /origin cannot change/,
    );
  });

  it("changes nothing for a member, a guest, an outsider or an anonymous non-member", async () => {
    const site = await insertSite(scenario.admin, scenario.workspaceId);
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectNoRows(
        await actor.client
          .from("sites")
          .update({ origin: randomOrigin() })
          .eq("id", site.id)
          .select("id"),
      );
    }
    const row = unwrap(
      await scenario.admin.from("sites").select("origin").eq("id", site.id).single(),
    );
    expect(row.origin).toBe(site.origin);
  });

  it("denies moving a site to another workspace", async () => {
    expectPermissionDenied(
      await scenario.owner.client
        .from("sites")
        .update({ workspace_id: scenario.otherWorkspaceId })
        .eq("id", scenario.site.id),
    );
    expectImmutable(
      await scenario.admin
        .from("sites")
        .update({ workspace_id: scenario.otherWorkspaceId })
        .eq("id", scenario.site.id),
    );
  });
});

describe("sites delete", () => {
  it("lets the owner delete a site together with its threads", async () => {
    const site = await insertSite(scenario.admin, scenario.workspaceId);
    const thread = await insertThread(scenario.admin, site, scenario.owner.id);
    expectOneRow(await scenario.owner.client.from("sites").delete().eq("id", site.id).select("id"));
    expect(await siteExists(site.id)).toBe(false);
    expectNoRows(await scenario.admin.from("threads").select("id").eq("id", thread.id));
  });

  it("removes nothing for a member, a guest, an outsider or an anonymous non-member", async () => {
    const site = await insertSite(scenario.admin, scenario.workspaceId);
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectNoRows(await actor.client.from("sites").delete().eq("id", site.id).select("id"));
    }
    expect(await siteExists(site.id)).toBe(true);
  });
});
