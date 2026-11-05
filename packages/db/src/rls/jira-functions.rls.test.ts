import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PERMISSION_DENIED,
  createScenario,
  destroyScenario,
  expectCode,
  unwrap,
  type Scenario,
} from "../test-harness";

const TOKEN = "jira_test_api_token";

let scenario: Scenario;
let secretId: string;

beforeAll(async () => {
  scenario = await createScenario();
  secretId = unwrap(
    await scenario.admin.rpc("integration_secret_upsert", {
      p_value: TOKEN,
      p_workspace_id: scenario.workspaceId,
      p_provider: "jira",
    }),
  );
  const inserted = await scenario.admin.from("integrations").insert({
    workspace_id: scenario.workspaceId,
    provider: "jira",
    settings: { siteUrl: "https://org.atlassian.net", email: "user@example.com" },
    secret_id: secretId,
  });
  expect(inserted.error).toBeNull();
  const clickUp = await scenario.admin.from("integrations").insert({
    workspace_id: scenario.workspaceId,
    provider: "clickup",
    settings: { listId: "2" },
  });
  expect(clickUp.error).toBeNull();
});

afterAll(async () => {
  await destroyScenario(scenario);
});

describe("jira_configured", () => {
  it("answers true for the owner and the member of a configured workspace", async () => {
    const owner = await scenario.owner.client.rpc("jira_configured", {
      p_workspace_id: scenario.workspaceId,
    });
    expect(owner.error).toBeNull();
    expect(owner.data).toBe(true);

    const member = await scenario.member.client.rpc("jira_configured", {
      p_workspace_id: scenario.workspaceId,
    });
    expect(member.error).toBeNull();
    expect(member.data).toBe(true);
  });

  it("answers false for a guest, an outsider and a stranger", async () => {
    for (const actor of [scenario.guest, scenario.outsider, scenario.stranger]) {
      const result = await actor.client.rpc("jira_configured", {
        p_workspace_id: scenario.workspaceId,
      });
      expect(result.error).toBeNull();
      expect(result.data).toBe(false);
    }
  });

  it("answers false for a jira row without a token", async () => {
    const unlinked = await scenario.admin
      .from("integrations")
      .update({ secret_id: null })
      .eq("workspace_id", scenario.workspaceId)
      .eq("provider", "jira");
    expect(unlinked.error).toBeNull();

    const result = await scenario.owner.client.rpc("jira_configured", {
      p_workspace_id: scenario.workspaceId,
    });
    expect(result.data).toBe(false);

    const relinked = await scenario.admin
      .from("integrations")
      .update({ secret_id: secretId })
      .eq("workspace_id", scenario.workspaceId)
      .eq("provider", "jira");
    expect(relinked.error).toBeNull();
  });
});

describe("jira_disconnect", () => {
  it("denies a member, a guest, an outsider and a stranger", async () => {
    for (const actor of [scenario.member, scenario.guest, scenario.outsider, scenario.stranger]) {
      const result = await actor.client.rpc("jira_disconnect", {
        p_workspace_id: scenario.workspaceId,
      });
      expectCode(result, PERMISSION_DENIED);
    }
    const stillConfigured = await scenario.owner.client.rpc("jira_configured", {
      p_workspace_id: scenario.workspaceId,
    });
    expect(stillConfigured.data).toBe(true);
  });

  it("lets the owner remove the jira integration and its token, and keeps clickup", async () => {
    const result = await scenario.owner.client.rpc("jira_disconnect", {
      p_workspace_id: scenario.workspaceId,
    });
    expect(result.error).toBeNull();

    const rows = await scenario.admin
      .from("integrations")
      .select("provider")
      .eq("workspace_id", scenario.workspaceId);
    expect(rows.data).toEqual([{ provider: "clickup" }]);

    const token = await scenario.admin.rpc("integration_secret_read", { p_secret_id: secretId });
    expect(token.data).toBeNull();

    const configured = await scenario.owner.client.rpc("jira_configured", {
      p_workspace_id: scenario.workspaceId,
    });
    expect(configured.data).toBe(false);
  });
});
