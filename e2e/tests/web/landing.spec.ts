import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { WEB_ORIGIN, signInOnWeb } from "../../support/web-auth";

test("the landing page renders, opens the demo and logs no console errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    problems.push(error.message);
  });

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { level: 1, name: "Figma-style comments on any live website." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Install the extension" })).toHaveAttribute(
    "href",
    "#install",
  );
  await expect(page.getByRole("region", { name: "Features" })).toBeVisible();
  expect(problems).toEqual([]);

  await page.getByRole("link", { name: "Try the live demo" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Comments that stay on the page" }),
  ).toBeVisible();
});

test("the landing header links to the dashboard for a signed-in member", async ({ page }) => {
  await signInOnWeb(page, `e2e-${randomUUID()}@sitenote.test`);
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app`);

  await page.goto(`${WEB_ORIGIN}/`);
  const banner = page.getByRole("banner");
  await expect(banner.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(banner.getByRole("link", { name: "Sign in" })).toHaveCount(0);

  await banner.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app`);
});
