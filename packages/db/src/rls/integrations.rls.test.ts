import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CHECK_VIOLATION,
  UNIQUE_VIOLATION,
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

const SAFE_COLUMNS = "id, workspace_id, provider, settings";

let scenario: Scenario;
let secretId: string;

beforeAll(async () => {
  scenario = await createScenario();
  secretId = randomUUID();
});

afterAll(async () => {
  await destroyScenario(scenario);
});

describe("integrations insert", () => {
  it("lets the owner connect a provider", async () => {
    const result = await scenario.owner.client
      .from("integrations")
      .insert({
        workspace_id: scenario.workspaceId,
        provider: "clickup",
        settings: { team_id: "1", list_id: "2" },
      })
      .select(SAFE_COLUMNS);
    expectOneRow(result);
    expect(result.data?.[0]?.settings).toEqual({ team_id: "1", list_id: "2" });
  });

  it("denies a second integration for the same provider", async () => {
    expectCode(
      await scenario.owner.client
        .from("integrations")
        .insert({ workspace_id: scenario.workspaceId, provider: "clickup" }),
      UNIQUE_VIOLATION,
    );
  });

  it("denies a member, a guest, an outsider and an anonymous non-member", async () => {
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectRlsViolation(
        await actor.client
          .from("integrations")
          .insert({ workspace_id: scenario.workspaceId, provider: "clickup" }),
      );
    }
  });

  it("denies choosing the secret reference", async () => {
    expectPermissionDenied(
      await scenario.outsider.client.from("integrations").insert({
        workspace_id: scenario.otherWorkspaceId,
        provider: "clickup",
        secret_id: secretId,
      }),
    );
  });

  it("rejects settings that are not a small json object", async () => {
    expectCode(
      await scenario.outsider.client.from("integrations").insert({
        workspace_id: scenario.otherWorkspaceId,
        provider: "clickup",
        settings: [],
      }),
      CHECK_VIOLATION,
    );
    expectCode(
      await scenario.outsider.client.from("integrations").insert({
        workspace_id: scenario.otherWorkspaceId,
        provider: "clickup",
        settings: { blob: "x".repeat(9000) },
      }),
      CHECK_VIOLATION,
    );
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(
      await createPublicClient()
        .from("integrations")
        .insert({ workspace_id: scenario.workspaceId, provider: "clickup" }),
    );
  });
});

describe("integrations select", () => {
  it("shows the integration, without secret_id, to the owner only", async () => {
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectNoRows(
        await actor.client
          .from("integrations")
          .select(SAFE_COLUMNS)
          .eq("workspace_id", scenario.workspaceId),
      );
    }
    expectOneRow(
      await scenario.owner.client
        .from("integrations")
        .select(SAFE_COLUMNS)
        .eq("workspace_id", scenario.workspaceId),
    );
  });

  it("never lets any client read, filter or sort by secret_id", async () => {
    await scenario.admin
      .from("integrations")
      .update({ secret_id: secretId })
      .eq("workspace_id", scenario.workspaceId);
    const attempts = [
      scenario.owner.client.from("integrations").select("id, secret_id"),
      scenario.owner.client.from("integrations").select("*"),
      scenario.owner.client.from("integrations").select("id").eq("secret_id", secretId),
      scenario.owner.client.from("integrations").select("id").order("secret_id"),
      scenario.member.client.from("integrations").select("id, secret_id"),
      scenario.outsider.client.from("integrations").select("id").eq("secret_id", secretId),
    ];
    for (const attempt of attempts) {
      expectPermissionDenied(await attempt);
    }
    const reread = unwrap(
      await scenario.admin
        .from("integrations")
        .select("secret_id")
        .eq("workspace_id", scenario.workspaceId)
        .single(),
    );
    expect(reread.secret_id).toBe(secretId);
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(await createPublicClient().from("integrations").select(SAFE_COLUMNS));
  });
});

describe("integrations update", () => {
  it("lets the owner change the settings", async () => {
    const result = await scenario.owner.client
      .from("integrations")
      .update({ settings: { list_id: "999" } })
      .eq("workspace_id", scenario.workspaceId)
      .select("settings");
    expectOneRow(result);
    expect(result.data?.[0]?.settings).toEqual({ list_id: "999" });
  });

  it("changes nothing for a member, a guest, an outsider or an anonymous non-member", async () => {
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectNoRows(
        await actor.client
          .from("integrations")
          .update({ settings: { list_id: "hijacked" } })
          .eq("workspace_id", scenario.workspaceId)
          .select("id"),
      );
    }
    const row = unwrap(
      await scenario.admin
        .from("integrations")
        .select("settings")
        .eq("workspace_id", scenario.workspaceId)
        .single(),
    );
    expect(row.settings).toEqual({ list_id: "999" });
  });

  it("denies replacing the secret reference, the provider or the workspace", async () => {
    const edits = [
      { secret_id: randomUUID() },
      { secret_id: null },
      { provider: "clickup" as const },
      { workspace_id: scenario.otherWorkspaceId },
    ];
    for (const edit of edits) {
      expectPermissionDenied(
        await scenario.owner.client
          .from("integrations")
          .update(edit)
          .eq("workspace_id", scenario.workspaceId),
      );
    }
    expectImmutable(
      await scenario.admin
        .from("integrations")
        .update({ workspace_id: scenario.otherWorkspaceId })
        .eq("workspace_id", scenario.workspaceId),
    );
  });
});

describe("integrations delete", () => {
  it("removes nothing for a member, a guest, an outsider or an anonymous non-member", async () => {
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      expectNoRows(
        await actor.client
          .from("integrations")
          .delete()
          .eq("workspace_id", scenario.workspaceId)
          .select("id"),
      );
    }
  });

  it("lets the owner disconnect the provider", async () => {
    expectOneRow(
      await scenario.owner.client
        .from("integrations")
        .delete()
        .eq("workspace_id", scenario.workspaceId)
        .select("id"),
    );
  });
});
