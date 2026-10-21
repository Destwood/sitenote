import { expect, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { clearMailbox, waitForOtpCode } from "../mailpit";

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

export async function requestCode(popup: Page, email: string): Promise<string> {
  await clearMailbox(email);
  await popup.getByLabel("Email").fill(email);
  await popup.getByRole("button", { name: "Email me a code" }).click();
  await expect(popup.getByLabel("6-digit code")).toBeVisible();
  return waitForOtpCode(email);
}

export async function signIn(popup: Page, email: string): Promise<void> {
  const code = await requestCode(popup, email);
  await popup.getByLabel("6-digit code").fill(code);
  await popup.getByRole("button", { name: "Verify code" }).click();
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
