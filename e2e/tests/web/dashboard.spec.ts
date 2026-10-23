import { expect, test } from "@playwright/test";

import {
  SEEDED_MEMBER_ID,
  createDashboardThread,
  deleteDashboardThread,
  setSeededMemberRole,
  uniqueToken,
} from "../../support/dashboard";
import { SEEDED_WORKSPACE_ID } from "../../support/invites";
import { signInSeededUser } from "../../support/seeded-user";
import { WEB_ORIGIN, signInOnWeb } from "../../support/web-auth";

const OWNER = "owner@sitenote.test";
const GUEST = "guest@sitenote.test";
const WORKSPACE_PATH = `/app/w/${SEEDED_WORKSPACE_ID}`;
const THREADS_URL = `${WEB_ORIGIN}${WORKSPACE_PATH}/threads`;
const MEMBERS_URL = `${WEB_ORIGIN}${WORKSPACE_PATH}/members`;
const SITES_URL = `${WEB_ORIGIN}${WORKSPACE_PATH}/sites`;

const cleanup: (() => Promise<void>)[] = [];

test.afterEach(async () => {
  for (const task of cleanup.splice(0)) {
    await task();
  }
});

test("the owner finds a thread by search, filters it by status and resolves it", async ({
  page,
}) => {
  const token = uniqueToken();
  const owner = await signInSeededUser(OWNER);
  const thread = await createDashboardThread(owner, token);
  cleanup.push(() => deleteDashboardThread(owner, thread.id));

  await signInOnWeb(page, OWNER);
  await page.goto(`${THREADS_URL}?q=${token}`);
  const row = page.getByRole("row").filter({ hasText: token });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Open");

  await page.getByLabel("Status").selectOption("resolved");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("No threads match these filters.")).toBeVisible();

  await page.getByLabel("Status").selectOption("all");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.getByRole("link", { name: thread.pagePath }).click();
  await expect(page.getByRole("heading", { name: `Thread on ${thread.pagePath}` })).toBeVisible();
  await expect(page.getByText(`Dashboard check ${token}`)).toBeVisible();

  await page.getByRole("button", { name: "Resolve thread" }).click();
  await expect(page.getByRole("button", { name: "Reopen thread" })).toBeVisible();
  await expect(page.locator("dt", { hasText: "Resolved" })).toBeVisible();
});

test("the owner changes a member to guest and back", async ({ page }) => {
  const owner = await signInSeededUser(OWNER);
  cleanup.push(() => setSeededMemberRole(owner, SEEDED_MEMBER_ID, "member"));

  await signInOnWeb(page, OWNER);
  await page.goto(MEMBERS_URL);
  const row = page.getByRole("listitem").filter({ hasText: "Max Member" });

  await row.getByLabel("Role").selectOption("guest");
  await row.getByRole("button", { name: "Save role" }).click();
  await expect(row.getByText("Guest, joined", { exact: false })).toBeVisible();

  await row.getByLabel("Role").selectOption("member");
  await row.getByRole("button", { name: "Save role" }).click();
  await expect(row.getByText("Member, joined", { exact: false })).toBeVisible();
});

test("a guest sees the members without management controls and no invites link", async ({
  page,
}) => {
  await signInOnWeb(page, GUEST);

  await page.goto(MEMBERS_URL);
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save role" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove from workspace" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Leave workspace" })).toHaveCount(1);

  const sections = page.getByRole("navigation", { name: "Workspace sections" });
  await expect(sections.getByRole("link", { name: "Invites" })).toHaveCount(0);
});

test("the owner sees the seeded sites with their thread counts", async ({ page }) => {
  await signInOnWeb(page, OWNER);

  await page.goto(SITES_URL);
  await expect(page.getByRole("heading", { name: "Sites" })).toBeVisible();
  await expect(page.getByText("http://127.0.0.1:4173")).toBeVisible();
});
