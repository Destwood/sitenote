import { expect, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { signInOnWeb } from "../web-auth";

export function newEmail(): string {
  return `e2e-${randomUUID()}@sitenote.test`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface Evaluator {
  evaluate: (expression: string) => Promise<unknown>;
}

export function evaluateIn(target: Evaluator, expression: string): Promise<unknown> {
  return target.evaluate(expression);
}

export async function openPopup(
  context: BrowserContext,
  extensionId: string,
  search = "",
): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html${search}`);
  return popup;
}

export async function signIn(popup: Page, email: string): Promise<void> {
  const context = popup.context();
  const page = await context.newPage();
  await signInOnWeb(page, email, "/extension/connect");
  await page.getByRole("button", { name: "Connect the extension" }).click();
  await expect(page.getByTestId("extension-connected")).toBeVisible();
  await page.close();
  await context.clearCookies({ name: /^sb-/ });
  await popup.reload();
  await expect(popup.getByTestId("display-name")).toBeVisible();
}

export async function stopServiceWorker(context: BrowserContext, page: Page): Promise<void> {
  const cdp = await context.newCDPSession(page);
  const running = new Promise<string[]>((resolve) => {
    cdp.once("ServiceWorker.workerVersionUpdated", ({ versions }) => {
      resolve(versions.filter((v) => v.runningStatus === "running").map((v) => v.versionId));
    });
  });
  await cdp.send("ServiceWorker.enable");
  const versionIds = await running;
  expect(versionIds.length).toBeGreaterThan(0);

  const stopped = new Promise<void>((resolve) => {
    cdp.on("ServiceWorker.workerVersionUpdated", ({ versions }) => {
      if (versions.some((v) => v.runningStatus === "stopped")) {
        resolve();
      }
    });
  });
  for (const versionId of versionIds) {
    await cdp.send("ServiceWorker.stopWorker", { versionId });
  }
  await stopped;
}

export async function tabIdOf(popup: Page, urlPrefix: string): Promise<number> {
  const id = await evaluateIn(
    popup,
    `chrome.tabs.query({}).then((tabs) => tabs.find((tab) => tab.url !== undefined && tab.url.startsWith(${JSON.stringify(urlPrefix)}))?.id ?? null)`,
  );
  if (typeof id !== "number") {
    throw new Error(`No tab found for ${urlPrefix}`);
  }
  return id;
}

export async function pointPopupAt(
  popup: Page,
  extensionId: string,
  page: Page,
  urlPrefix: string,
): Promise<void> {
  const tabId = await tabIdOf(popup, urlPrefix);
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${String(tabId)}`);
  await expect(page.locator("body")).toBeVisible();
}

export async function enableSite(popup: Page, workspaceName: string): Promise<void> {
  await expect(popup.getByTestId("site-state")).toHaveText("Not enabled");
  await popup.getByRole("button", { name: "Enable on this site" }).click();
  await expect(popup.getByTestId("site-state")).toHaveText(`Enabled in ${workspaceName}`);
}

export async function openSiteMenu(popup: Page): Promise<void> {
  const trigger = popup.getByRole("button", { name: "More options" });
  if ((await trigger.getAttribute("aria-expanded")) === "false") {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}
