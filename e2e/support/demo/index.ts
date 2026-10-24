import { expect, type Locator, type Page } from "@playwright/test";
import { createSitenoteClient, type SitenoteClient } from "@sitenote/db";

import { readSupabaseEnv, readSupabaseSecret } from "../supabase-env";
import { WEB_ORIGIN } from "../web-auth";

export const DEMO_WORKSPACE_ID = "00000000-0000-4000-8000-00000000d3e0";
export const DEMO_PATH = "/demo";
export const DEMO_URL = `${WEB_ORIGIN}${DEMO_PATH}`;
export const SEEDED_PIN_COUNT = 4;
export const RATE_LIMIT_MESSAGE = "Demo limit reached — try again later.";
export const NAME_DIALOG = "Choose the name your comments show";
const DEMO_STORAGE_KEY = "sitenote-demo";

export function demoAdminClient(): SitenoteClient {
  const { url } = readSupabaseEnv();
  return createSitenoteClient(url, readSupabaseSecret(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function resetDemo(admin: SitenoteClient): Promise<void> {
  const { error } = await admin.rpc("reset_demo");
  if (error !== null) {
    throw new Error(`reset_demo failed: ${error.message}`);
  }
}

export async function demoSiteId(admin: SitenoteClient): Promise<string> {
  const { data, error } = await admin
    .from("sites")
    .select("id")
    .eq("workspace_id", DEMO_WORKSPACE_ID)
    .eq("origin", WEB_ORIGIN)
    .single();
  if (error !== null) {
    throw new Error(`Reading the demo site failed: ${error.message}`);
  }
  return data.id;
}

export function threadPins(page: Page): Locator {
  return page.getByRole("button", { name: /^Thread \d+, (open|resolved)$/ });
}

export async function openDemo(page: Page): Promise<void> {
  await page.goto(DEMO_URL);
  await expect(
    page.getByRole("button", { name: "Start commenting", exact: true }).first(),
  ).toBeEnabled();
}

export async function joinDemo(page: Page, name: string): Promise<void> {
  await openDemo(page);
  await page.getByRole("button", { name: "Start commenting", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: NAME_DIALOG });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Your name").fill(name);
  await dialog.getByRole("button", { name: "Start commenting", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(threadPins(page)).toHaveCount(SEEDED_PIN_COUNT);
}

export async function visitorIdOf(page: Page): Promise<string> {
  const id = await page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) {
      return null;
    }
    const session = JSON.parse(raw) as { user?: { id?: unknown } };
    return typeof session.user?.id === "string" ? session.user.id : null;
  }, DEMO_STORAGE_KEY);
  if (id === null) {
    throw new Error("The demo session is not stored in this browser.");
  }
  return id;
}

export async function commentOn(page: Page, testId: string, body: string): Promise<void> {
  await page.getByTestId(testId).click({ position: { x: 20, y: 20 } });
  const dialog = page.getByRole("dialog", { name: "New thread" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Comment" }).fill(body);
  await dialog.getByRole("button", { name: "Comment", exact: true }).click();
}
