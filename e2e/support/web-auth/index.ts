import { expect, type BrowserContext, type Page } from "@playwright/test";

import { clearMailbox, waitForOtpCode } from "../mailpit";

export const WEB_ORIGIN = "http://localhost:3000";

export async function requestWebCode(page: Page, email: string): Promise<string> {
  await clearMailbox(email);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  return waitForOtpCode(email);
}

export async function signInOnWeb(page: Page, email: string, path = "/sign-in"): Promise<void> {
  await page.goto(`${WEB_ORIGIN}${path}`);
  const code = await requestWebCode(page, email);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Verify code" }).click();
}

export async function webAuthCookies(context: BrowserContext): Promise<string[]> {
  const cookies = await context.cookies(WEB_ORIGIN);
  return cookies.filter((cookie) => cookie.name.startsWith("sb-")).map((cookie) => cookie.name);
}
