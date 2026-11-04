import { expect, type BrowserContext, type Page } from "@playwright/test";

import { clearMailbox, waitForSignInLink } from "../mailpit";

export const WEB_ORIGIN = "http://localhost:3000";

export async function requestWebLink(page: Page, email: string): Promise<string> {
  await clearMailbox(email);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("We sent a sign-in link");
  return waitForSignInLink(email);
}

export async function signInOnWeb(page: Page, email: string, path = "/sign-in"): Promise<void> {
  await page.goto(`${WEB_ORIGIN}${path}`);
  const link = await requestWebLink(page, email);
  await page.goto(link);
  await page.waitForURL(
    (url) =>
      url.origin === WEB_ORIGIN &&
      !url.pathname.startsWith("/auth/callback") &&
      !url.pathname.startsWith("/sign-in"),
  );
}

export async function webAuthCookies(context: BrowserContext): Promise<string[]> {
  const cookies = await context.cookies(WEB_ORIGIN);
  return cookies.filter((cookie) => cookie.name.startsWith("sb-")).map((cookie) => cookie.name);
}
