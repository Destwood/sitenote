import type { SitenoteClient } from "@sitenote/db";
import { expect, test } from "@playwright/test";

import { createDashboardThread, deleteDashboardThread, uniqueToken } from "../../support/dashboard";
import { traceFunctionCalls } from "../../support/function-trace";
import { SEEDED_WORKSPACE_ID } from "../../support/invites";
import { signInSeededUser } from "../../support/seeded-user";
import { WEB_ORIGIN, signInOnWeb } from "../../support/web-auth";

const OWNER = "owner@sitenote.test";
const MEMBER = "member@sitenote.test";
const WORKSPACE_PATH = `/app/w/${SEEDED_WORKSPACE_ID}`;
const INTEGRATIONS_URL = `${WEB_ORIGIN}${WORKSPACE_PATH}/integrations`;
const THREADS_URL = `${WEB_ORIGIN}${WORKSPACE_PATH}/threads`;
const TASK_URL = "https://app.clickup.com/t/86e2e";

const cleanup: (() => Promise<void>)[] = [];

test.afterEach(async () => {
  for (const task of cleanup.splice(0)) {
    await task();
  }
});

async function disconnectClickUp(owner: SitenoteClient): Promise<void> {
  const { error } = await owner.rpc("clickup_disconnect", { p_workspace_id: SEEDED_WORKSPACE_ID });
  expect(error).toBeNull();
}

test("the owner connects ClickUp and a thread becomes a task with a link back", async ({
  page,
}, testInfo) => {
  traceFunctionCalls(page, testInfo);
  const owner = await signInSeededUser(OWNER);
  await disconnectClickUp(owner);
  cleanup.push(() => disconnectClickUp(owner));
  const token = uniqueToken();
  const thread = await createDashboardThread(owner, token);
  cleanup.push(() => deleteDashboardThread(owner, thread.id));

  await signInOnWeb(page, OWNER);
  await page.goto(INTEGRATIONS_URL);
  await page.getByLabel("Personal token").fill("pk_e2e_token");
  await page.getByRole("button", { name: "Load teams" }).click();
  await page.getByLabel("Team").selectOption({ label: "Northwind ClickUp" });
  await page.getByLabel("Space").selectOption({ label: "Web" });
  await page.getByLabel("List").selectOption({ label: "Website feedback" });
  await page.getByRole("button", { name: "Save ClickUp list" }).click();
  await expect(
    page.getByText("Tasks go to Website feedback in Web (Northwind ClickUp)."),
  ).toBeVisible();

  await page.goto(`${THREADS_URL}?q=${token}`);
  await page.getByRole("link", { name: thread.pagePath }).click();
  await page.getByRole("button", { name: "Create ClickUp task" }).click();
  await expect(page.getByRole("link", { name: "Open in ClickUp" })).toHaveAttribute(
    "href",
    TASK_URL,
  );
  await page.reload();
  await expect(page.getByRole("link", { name: "Open in ClickUp" })).toHaveAttribute(
    "href",
    TASK_URL,
  );
});

test("a member does not get the integrations page", async ({ page }) => {
  await signInOnWeb(page, MEMBER);
  await page.goto(INTEGRATIONS_URL);
  await expect(page.getByRole("heading", { name: "Integrations" })).toHaveCount(0);
});
