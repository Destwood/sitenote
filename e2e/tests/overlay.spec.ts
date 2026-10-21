import { SITENOTE_ROOT_TAG } from "@sitenote/core";

import { expect, test } from "../fixtures/extension";

const INSIDE_ORIGIN = "http://localhost:9";
const OUTSIDE_ORIGIN = "http://outside.test";
const MAX_EDGE_DISTANCE = 32;

test("mounts the overlay in the bottom-right corner of the fixture page", async ({ page }) => {
  await page.goto("/");

  const host = page.locator(SITENOTE_ROOT_TAG);
  await expect(host).toHaveCount(1);

  const overlay = host.getByTestId("sitenote-hello");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveRole("status");
  await expect(overlay).toContainText("Sitenote");
  await expect(overlay).toContainText("Overlay is running");

  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }));
  const box = await overlay.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    return;
  }

  const rightGap = viewport.width - (box.x + box.width);
  const bottomGap = viewport.height - (box.y + box.height);
  expect(rightGap).toBeGreaterThanOrEqual(0);
  expect(rightGap).toBeLessThanOrEqual(MAX_EDGE_DISTANCE);
  expect(bottomGap).toBeGreaterThanOrEqual(0);
  expect(bottomGap).toBeLessThanOrEqual(MAX_EDGE_DISTANCE);
});

test("mounts the overlay only on origins inside the match patterns", async ({ context }) => {
  for (const origin of [INSIDE_ORIGIN, OUTSIDE_ORIGIN]) {
    await context.route(`${origin}/**`, (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><title>Routed</title><main><h1>Routed page</h1></main>",
      }),
    );
  }

  const inside = await context.newPage();
  await inside.goto(`${INSIDE_ORIGIN}/`);
  await expect(inside.locator(SITENOTE_ROOT_TAG).getByTestId("sitenote-hello")).toBeVisible();

  const outside = await context.newPage();
  await outside.goto(`${OUTSIDE_ORIGIN}/`);
  await expect(outside.getByRole("heading", { name: "Routed page" })).toBeVisible();
  await expect(outside.locator(SITENOTE_ROOT_TAG)).toHaveCount(0);
  await expect(outside.getByTestId("sitenote-hello")).toHaveCount(0);
});
