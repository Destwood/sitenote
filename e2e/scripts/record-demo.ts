import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import {
  NAME_DIALOG,
  SEEDED_PIN_COUNT,
  demoAdminClient,
  openDemo,
  resetDemo,
  threadPins,
} from "../support/demo";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC_MEDIA = resolve(ROOT, "apps/web/public/media");
const VIDEO_PATH = resolve(PUBLIC_MEDIA, "sitenote-demo.webm");
const POSTER_PATH = resolve(PUBLIC_MEDIA, "sitenote-demo-poster.png");
const OG_PATH = resolve(ROOT, "apps/web/src/app/opengraph-image.png");
const FRAME = { width: 1280, height: 720 };
const OG_FRAME = { width: 1200, height: 630 };
const NEW_THREAD_NUMBER = SEEDED_PIN_COUNT + 1;
const COMMENT = "Pin this card to the team review. Clients need it without an account.";
const REPLY = "Good catch. The pin stays with the card when the layout shifts.";
const BEAT = 900;
const HOLD = 2200;
const TYPING_DELAY = 55;

async function pause(page: Page, ms: number): Promise<void> {
  await page.waitForTimeout(ms);
}

test("records the product video, the poster and the Open Graph image from the demo", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  await mkdir(PUBLIC_MEDIA, { recursive: true });
  await resetDemo(demoAdminClient());

  const recording = await browser.newContext({
    viewport: FRAME,
    recordVideo: { dir: test.info().outputPath("video"), size: FRAME },
  });
  const page = await recording.newPage();
  await openDemo(page);
  await pause(page, HOLD);
  await page.getByRole("button", { name: "Start commenting", exact: true }).first().click();
  const nameDialog = page.getByRole("dialog", { name: NAME_DIALOG });
  await expect(nameDialog).toBeVisible();
  await pause(page, BEAT);
  await nameDialog.getByLabel("Your name").pressSequentially("Alex", { delay: TYPING_DELAY });
  await nameDialog.getByRole("button", { name: "Start commenting", exact: true }).click();
  await expect(nameDialog).toBeHidden();
  await expect(threadPins(page).first()).toBeVisible();
  await pause(page, HOLD);
  const target = page.getByTestId("demo-feature-pins");
  await target.hover();
  await pause(page, BEAT);
  await target.click({ position: { x: 20, y: 20 } });
  const composer = page.getByRole("dialog", { name: "New thread" });
  await expect(composer).toBeVisible();
  await pause(page, BEAT);
  await composer
    .getByRole("textbox", { name: "Comment" })
    .pressSequentially(COMMENT, { delay: TYPING_DELAY });
  await composer.getByRole("button", { name: "Comment", exact: true }).click();
  const thread = page.getByRole("dialog", { name: `Thread ${String(NEW_THREAD_NUMBER)}` });
  await expect(thread).toContainText(COMMENT);
  await pause(page, HOLD);
  await page.screenshot({ path: POSTER_PATH });

  await pause(page, BEAT);
  await thread
    .getByRole("textbox", { name: "Reply" })
    .pressSequentially(REPLY, { delay: TYPING_DELAY });
  await thread.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(thread).toContainText(REPLY);
  await pause(page, HOLD * 2);

  const video = page.video();
  await recording.close();
  if (video === null) {
    throw new Error("The demo recording did not produce a video.");
  }
  await copyFile(await video.path(), VIDEO_PATH);

  const overview = await browser.newContext({ viewport: OG_FRAME });
  const overviewPage = await overview.newPage();
  await openDemo(overviewPage);
  await overviewPage.screenshot({ path: OG_PATH });
  await overview.close();
});
