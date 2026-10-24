import { expect, test, type Page } from "@playwright/test";

import {
  DEMO_URL,
  DEMO_VIEWPORT,
  DEMO_WORKSPACE_ID,
  RATE_LIMIT_MESSAGE,
  SEEDED_PIN_COUNT,
  commentOn,
  demoAdminClient,
  demoSiteId,
  joinDemo,
  resetDemo,
  threadPins,
  visitorIdOf,
} from "../../support/demo";

const LIVE_TIMEOUT_MS = 15_000;
const NEW_THREAD_NUMBER = SEEDED_PIN_COUNT + 1;
const ELEMENT_ANCHOR = {
  kind: "element",
  selectors: {
    testId: "demo-feature-clickup",
    css: '[data-testid="demo-feature-clickup"]',
    nthPath: "main > article",
  },
  fingerprint: {
    tag: "article",
    text: "ClickUp tasksTurn a comment into a task with the page context and screenshot attached.",
    classes: [],
    width: 267,
    height: 150,
  },
  offset: { x: 0.5, y: 0.5 },
};

test.describe.configure({ mode: "serial" });
test.use({ viewport: DEMO_VIEWPORT });

async function enableCommenting(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Start commenting", exact: true }).first().click();
}

test("a visitor without the extension comments, and another visitor sees and answers it live", async ({
  browser,
}) => {
  const admin = demoAdminClient();
  await resetDemo(admin);
  const dana = await browser.newContext({ viewport: DEMO_VIEWPORT });
  const eli = await browser.newContext({ viewport: DEMO_VIEWPORT });
  try {
    const danaPage = await dana.newPage();
    const eliPage = await eli.newPage();
    await joinDemo(danaPage, "Demo Dana");
    await joinDemo(eliPage, "Demo Eli");

    await commentOn(danaPage, "demo-feature-guests", "Guests need no account, which helps.");
    await expect(threadPins(danaPage)).toHaveCount(NEW_THREAD_NUMBER);
    await expect(threadPins(eliPage)).toHaveCount(NEW_THREAD_NUMBER, { timeout: LIVE_TIMEOUT_MS });
    const danaId = await visitorIdOf(danaPage);
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("threads")
            .select("screenshot_path")
            .eq("created_by", danaId);
          return data?.some((thread) => thread.screenshot_path !== null) ?? false;
        },
        { timeout: LIVE_TIMEOUT_MS },
      )
      .toBe(true);

    const danaThread = danaPage.getByRole("dialog", {
      name: `Thread ${String(NEW_THREAD_NUMBER)}`,
    });
    await expect(danaThread).toContainText("Guests need no account, which helps.");

    await eliPage
      .getByRole("button", { name: `Thread ${String(NEW_THREAD_NUMBER)}, open`, exact: true })
      .click();
    const eliThread = eliPage.getByRole("dialog", { name: `Thread ${String(NEW_THREAD_NUMBER)}` });
    await eliThread.getByRole("textbox", { name: "Reply" }).fill("Agreed, and it stays pinned.");
    await eliThread.getByRole("button", { name: "Reply", exact: true }).click();

    await expect(danaThread).toContainText("Agreed, and it stays pinned.", {
      timeout: LIVE_TIMEOUT_MS,
    });

    await danaPage.reload();
    await expect(threadPins(danaPage)).toHaveCount(NEW_THREAD_NUMBER);
    await expect(
      danaPage.getByRole("dialog", { name: "Choose the name your comments show" }),
    ).toHaveCount(0);
    const profile = await admin
      .from("profiles")
      .select("display_name")
      .eq("user_id", danaId)
      .single();
    expect(profile.data?.display_name).toBe("Demo Dana");
  } finally {
    await dana.close();
    await eli.close();
  }
});

test("the eleventh thread in an hour is refused with the demo limit message", async ({ page }) => {
  const admin = demoAdminClient();
  await resetDemo(admin);
  await joinDemo(page, "Demo Rivet");
  const visitor = await visitorIdOf(page);
  const site = await demoSiteId(admin);

  const inserted = await admin
    .from("threads")
    .insert(
      Array.from({ length: 10 }, () => ({
        workspace_id: DEMO_WORKSPACE_ID,
        site_id: site,
        page_url: DEMO_URL,
        anchor: ELEMENT_ANCHOR,
        created_by: visitor,
      })),
    )
    .select("id");
  if (inserted.error !== null) {
    throw new Error(`Seeding the visitor threads failed: ${inserted.error.message}`);
  }
  const noted = await admin.from("comments").insert(
    inserted.data.map((thread) => ({
      thread_id: thread.id,
      workspace_id: DEMO_WORKSPACE_ID,
      author_id: visitor,
      body: "Earlier note",
    })),
  );
  if (noted.error !== null) {
    throw new Error(`Seeding the visitor comments failed: ${noted.error.message}`);
  }

  await page.reload();
  await expect(threadPins(page)).toHaveCount(SEEDED_PIN_COUNT + 10);
  await enableCommenting(page);
  await commentOn(page, "demo-feature-clickup", "One more");

  await expect(page.getByText(RATE_LIMIT_MESSAGE, { exact: true })).toBeVisible();
  await expect(threadPins(page)).toHaveCount(SEEDED_PIN_COUNT + 10);
});

test("the daily reset removes visitor threads and restores the seeded pins", async ({ page }) => {
  const admin = demoAdminClient();
  await resetDemo(admin);
  await joinDemo(page, "Demo Vera");
  await enableCommenting(page);
  await commentOn(page, "demo-pricing-solo", "Is the solo plan limited?");
  await expect(threadPins(page)).toHaveCount(NEW_THREAD_NUMBER);

  await resetDemo(admin);
  await page.reload();
  await expect(threadPins(page)).toHaveCount(SEEDED_PIN_COUNT);
});
