import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/extension";
import {
  FIXTURE_ORIGIN,
  MEMBER,
  OWNER,
  hostOf,
  openReviewPage,
  pinOf,
} from "../../support/comments";
import {
  SEEDED_MEMBER_ID,
  createDashboardThread,
  deleteDashboardThread,
  uniqueToken,
  type DashboardThread,
} from "../../support/dashboard";
import { SEEDED_WORKSPACE_ID } from "../../support/invites";
import { openPopup } from "../../support/extension";
import { signInSeededUser } from "../../support/seeded-user";
import { WEB_ORIGIN, signInOnWeb } from "../../support/web-auth";

const WORKSPACE_PATH = `/app/w/${SEEDED_WORKSPACE_ID}`;
const OTHER_PAGE_TOAST = "This comment is on another page or you do not have access.";

const cleanup: (() => Promise<void>)[] = [];

test.afterEach(async () => {
  for (const task of cleanup.splice(0)) {
    await task();
  }
});

async function seedThread(): Promise<{ thread: DashboardThread; token: string }> {
  const token = uniqueToken();
  const owner = await signInSeededUser(OWNER);
  const thread = await createDashboardThread(owner, token);
  cleanup.push(() => deleteDashboardThread(owner, thread.id));
  return { thread, token };
}

async function expectThreadFocused(page: Page, pagePath: string, text: string) {
  await expect(page).toHaveURL(`${FIXTURE_ORIGIN}${pagePath}`);
  await expect(hostOf(page)).toHaveAttribute("data-live", "true");
  await expect(pinOf(page, 1)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("dialog", { name: "Thread 1" })).toContainText(text);
}

test("the thread link from the dashboard opens the page with its pin active and no hash left", async ({
  context,
  extensionId,
}) => {
  const { thread, token } = await seedThread();
  await openReviewPage(context, extensionId, OWNER, thread.pagePath);

  const web = await context.newPage();
  await signInOnWeb(web, OWNER);
  await web.goto(`${WEB_ORIGIN}${WORKSPACE_PATH}/threads/${thread.id}`);
  const threadLink = await web.getByLabel("Thread link").inputValue();
  expect(new URL(threadLink).pathname).toBe(`/t/${thread.id}`);

  await web.goto(threadLink);
  const openOnPage = web.getByRole("button", { name: "Open on page" });
  await expect(openOnPage).toBeVisible();
  const [opened] = await Promise.all([context.waitForEvent("page"), openOnPage.click()]);

  await expectThreadFocused(opened, thread.pagePath, `Dashboard check ${token}`);
});

test("a reply notification opens the thread on its page with its pin active", async ({
  context,
  extensionId,
}) => {
  const { thread, token } = await seedThread();
  const member = await signInSeededUser(MEMBER);
  const reply = await member.from("comments").insert({
    thread_id: thread.id,
    workspace_id: SEEDED_WORKSPACE_ID,
    author_id: SEEDED_MEMBER_ID,
    body: `Reply ${token}`,
  });
  if (reply.error !== null) {
    throw new Error(`Seeding the reply failed: ${reply.error.message}`);
  }
  await openReviewPage(context, extensionId, OWNER, thread.pagePath);

  const popup = await openPopup(context, extensionId);
  await popup.getByRole("button", { name: "Notifications" }).click();
  const item = popup.getByTestId("notification-item").filter({ hasText: `Reply ${token}` });
  const [opened] = await Promise.all([context.waitForEvent("page"), item.click()]);

  await expectThreadFocused(opened, thread.pagePath, `Reply ${token}`);
});

test("a thread link to a page that does not hold the thread says so", async ({
  context,
  extensionId,
}) => {
  const { thread } = await seedThread();
  const otherPath = `/p/${uniqueToken()}`;
  await openReviewPage(context, extensionId, OWNER, otherPath);

  const linked = await context.newPage();
  await linked.goto(`${FIXTURE_ORIGIN}${otherPath}#sitenote=${thread.id}`);

  await expect(linked.getByText(OTHER_PAGE_TOAST)).toBeVisible();
  await expect(linked).toHaveURL(`${FIXTURE_ORIGIN}${otherPath}`);
});
