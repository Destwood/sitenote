import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PERMISSION_DENIED,
  createScenario,
  destroyScenario,
  expectCode,
  expectPermissionDenied,
  unwrap,
  type Scenario,
} from "../test-harness";

const TOKEN = "pk_test_clickup_token";

let scenario: Scenario;
let secretId: string;

beforeAll(async () => {
  scenario = await createScenario();
  secretId = unwrap(
    await scenario.admin.rpc("integration_secret_upsert", {
      p_value: TOKEN,
      p_workspace_id: scenario.workspaceId,
      p_provider: "clickup",
    }),
  );
  const inserted = await scenario.admin.from("integrations").insert({
    workspace_id: scenario.workspaceId,
    provider: "clickup",
    settings: { teamId: "1", listId: "2" },
    secret_id: secretId,
  });
  expect(inserted.error).toBeNull();
});

afterAll(async () => {
  await destroyScenario(scenario);
});

describe("clickup_configured", () => {
  it("answers true for the owner and the member of a configured workspace", async () => {
    const owner = await scenario.owner.client.rpc("clickup_configured", {
      p_workspace_id: scenario.workspaceId,
    });
    expect(owner.error).toBeNull();
    expect(owner.data).toBe(true);

    const member = await scenario.member.client.rpc("clickup_configured", {
      p_workspace_id: scenario.workspaceId,
    });
    expect(member.error).toBeNull();
    expect(member.data).toBe(true);
  });

  it("answers false for a guest, an outsider and a stranger", async () => {
    for (const actor of [scenario.guest, scenario.outsider, scenario.stranger]) {
      const result = await actor.client.rpc("clickup_configured", {
        p_workspace_id: scenario.workspaceId,
      });
      expect(result.error).toBeNull();
      expect(result.data).toBe(false);
    }
  });
});

describe("integration secrets", () => {
  it("denies the owner and every other client the token read and write functions", async () => {
    const read = await scenario.owner.client.rpc("integration_secret_read", {
      p_secret_id: secretId,
    });
    expectPermissionDenied(read);

    const write = await scenario.owner.client.rpc("integration_secret_upsert", {
      p_value: "pk_replaced",
      p_workspace_id: scenario.workspaceId,
      p_provider: "clickup",
      p_secret_id: secretId,
    });
    expectPermissionDenied(write);
  });

  it("lets the service role read the stored token and replace it under the same id", async () => {
    const before = await scenario.admin.rpc("integration_secret_read", { p_secret_id: secretId });
    expect(before.data).toBe(TOKEN);

    const replaced = await scenario.admin.rpc("integration_secret_upsert", {
      p_value: "pk_replaced",
      p_workspace_id: scenario.workspaceId,
      p_provider: "clickup",
      p_secret_id: secretId,
    });
    expect(replaced.data).toBe(secretId);

    const after = await scenario.admin.rpc("integration_secret_read", { p_secret_id: secretId });
    expect(after.data).toBe("pk_replaced");
  });

  it("rejects an unknown secret id instead of silently keeping the old token", async () => {
    const result = await scenario.admin.rpc("integration_secret_upsert", {
      p_value: "pk_unknown",
      p_workspace_id: scenario.workspaceId,
      p_provider: "clickup",
      p_secret_id: randomUUID(),
    });
    expectCode(result, "P0002");
  });
});

describe("clickup_disconnect", () => {
  it("denies a member and a guest", async () => {
    for (const actor of [scenario.member, scenario.guest]) {
      const result = await actor.client.rpc("clickup_disconnect", {
        p_workspace_id: scenario.workspaceId,
      });
      expectCode(result, PERMISSION_DENIED);
    }
    const stillConfigured = await scenario.owner.client.rpc("clickup_configured", {
      p_workspace_id: scenario.workspaceId,
    });
    expect(stillConfigured.data).toBe(true);
  });

  it("lets the owner remove the integration and its token", async () => {
    const result = await scenario.owner.client.rpc("clickup_disconnect", {
      p_workspace_id: scenario.workspaceId,
    });
    expect(result.error).toBeNull();

    const rows = await scenario.admin
      .from("integrations")
      .select("id")
      .eq("workspace_id", scenario.workspaceId);
    expect(rows.data).toEqual([]);

    const token = await scenario.admin.rpc("integration_secret_read", { p_secret_id: secretId });
    expect(token.data).toBeNull();
  });
});
