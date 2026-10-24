import { expect, test } from "@playwright/test";

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
