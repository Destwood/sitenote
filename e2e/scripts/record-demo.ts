import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import {
  SEEDED_PIN_COUNT,
  commentOn,
  demoAdminClient,
  joinDemo,
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
  await joinDemo(page, "Alex");
  await commentOn(page, "demo-feature-pins", COMMENT);
  await expect(threadPins(page)).toHaveCount(NEW_THREAD_NUMBER);
  const thread = page.getByRole("dialog", { name: `Thread ${String(NEW_THREAD_NUMBER)}` });
  await expect(thread).toContainText(COMMENT);
  await page.screenshot({ path: POSTER_PATH });

  await thread.getByRole("textbox", { name: "Reply" }).fill(REPLY);
  await thread.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(thread).toContainText(REPLY);

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
