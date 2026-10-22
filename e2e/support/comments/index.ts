import { SITENOTE_ROOT_TAG } from "@sitenote/core";
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { SitenoteClient } from "@sitenote/db";

import { launchExtensionContext } from "../../fixtures/extension";
import { enableSite, openPopup, pointPopupAt, signIn } from "../extension";

export const FIXTURE_ORIGIN = "http://127.0.0.1:4173";
export const WORKSPACE_NAME = "Northwind Studio";
export const OWNER = "owner@sitenote.test";
export const MEMBER = "member@sitenote.test";
export const GUEST = "guest@sitenote.test";

export interface ReviewSession {
  page: Page;
  popup: Page;
}

export function hostOf(page: Page): Locator {
  return page.locator(SITENOTE_ROOT_TAG);
}

export function pinOf(page: Page, number: number, state: "open" | "resolved" | "pending" = "open") {
  return page.getByRole("button", { name: `Thread ${String(number)}, ${state}`, exact: true });
}

export async function openReviewPage(
  context: BrowserContext,
  extensionId: string,
  email: string,
  path: string,
  origin: string = FIXTURE_ORIGIN,
  workspaceName: string = WORKSPACE_NAME,
): Promise<ReviewSession> {
  const popup = await openPopup(context, extensionId);
  await signIn(popup, email);
  const page = await context.newPage();
  await page.goto(`${origin}${path}`);
  await pointPopupAt(popup, extensionId, page, `${origin}${path}`);
  await enableSite(popup, workspaceName);
  await expect(hostOf(page)).toHaveAttribute("data-live", "true");
  return { page, popup };
}

export async function openInSecondContext(
  headless: boolean,
  baseURL: string | undefined,
  email: string,
  path: string,
  workspaceName: string = WORKSPACE_NAME,
): Promise<{ context: BrowserContext; session: ReviewSession }> {
  const context = await launchExtensionContext(headless, baseURL);
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const session = await openReviewPage(
      context,
      new URL(worker.url()).host,
      email,
      path,
      FIXTURE_ORIGIN,
      workspaceName,
    );
    return { context, session };
  } catch (error) {
    await context.close();
    throw error;
  }
}

export async function enterCommentMode({ page, popup }: ReviewSession): Promise<void> {
  await popup.getByRole("button", { name: "Comment mode" }).click();
  await expect(hostOf(page)).toHaveAttribute("data-comment-mode", "on");
  await expect(page.getByRole("status").filter({ hasText: "Comment mode:" })).toBeVisible();
}

export async function exitCommentMode(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Exit", exact: true }).click();
  await expect(hostOf(page)).toHaveAttribute("data-comment-mode", "off");
}

export async function submitNewThread(page: Page, body: string): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "New thread" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Comment" }).fill(body);
  await dialog.getByRole("button", { name: "Comment", exact: true }).click();
}

export async function commentOnElement(
  session: ReviewSession,
  selector: string,
  position: { x: number; y: number },
  body: string,
): Promise<void> {
  await enterCommentMode(session);
  await session.page.locator(selector).click({ position });
  await submitNewThread(session.page, body);
  await expect(session.page.getByRole("dialog", { name: "Thread 1" })).toBeVisible();
}

export async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("The element has no box");
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function deleteThreadsOnPage(owner: SitenoteClient, pageUrl: string): Promise<void> {
  const { error } = await owner.from("threads").delete().eq("page_url", pageUrl);
  if (error !== null) {
    throw new Error(`Cleanup of ${pageUrl} failed: ${error.message}`);
  }
}

export async function threadsOnPage(owner: SitenoteClient, pageUrl: string) {
  const { data, error } = await owner
    .from("threads")
    .select("id, status, anchor, comments(body, deleted_at, edited_at)")
    .eq("page_url", pageUrl);
  if (error !== null) {
    throw new Error(`Reading ${pageUrl} failed: ${error.message}`);
  }
  return data;
}
