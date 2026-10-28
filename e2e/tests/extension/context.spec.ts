import type { BrowserContext, Page } from "@playwright/test";
import { threadContextSchema } from "@sitenote/core";

import { expect, test } from "../../fixtures/extension";
import { launchExtensionContext } from "../../fixtures/extension";
import {
  FIXTURE_ORIGIN,
  centerOf,
  commentOnElement,
  enterCommentMode,
  hostOf,
  openReviewPage,
  pinOf,
  submitNewThread,
  type ReviewSession,
} from "../../support/comments";
import { evaluateIn, openSiteMenu, pointPopupAt } from "../../support/extension";
import {
  createFreshWorkspace,
  deleteFreshWorkspace,
  type FreshWorkspace,
} from "../../support/fresh-workspace";
import {
  BOX_COLOR,
  BOX_HEIGHT,
  BOX_WIDTH,
  PADDING,
  PAGE_COLOR,
  decodeImage,
  downloadScreenshot,
  isColor,
  onlyThread,
  removeScreenshots,
} from "../../support/screenshots";

test.describe.configure({ mode: "default" });

let workspace: FreshWorkspace;

test.beforeAll(async () => {
  workspace = await createFreshWorkspace("Olena Owner", "Max Member");
});

test.afterAll(async () => {
  const folder = await workspace.owner.client.storage
    .from("screenshots")
    .list(workspace.workspaceId);
  await removeScreenshots(
    workspace.owner.client,
    (folder.data ?? []).map((entry) => `${workspace.workspaceId}/${entry.name}`),
  );
  await deleteFreshWorkspace(workspace);
});

function open(context: BrowserContext, extensionId: string, path: string): Promise<ReviewSession> {
  return openReviewPage(
    context,
    extensionId,
    workspace.owner.email,
    path,
    FIXTURE_ORIGIN,
    workspace.workspaceName,
  );
}

function pageUrl(path: string): string {
  return `${FIXTURE_ORIGIN}${path.split("?")[0] ?? path}`;
}

async function deviceScale(page: Page): Promise<number> {
  return page.evaluate(() => window.devicePixelRatio);
}

async function storedImage(page: Page, path: string) {
  const thread = await onlyThread(workspace.owner.client, pageUrl(path));
  expect(thread.screenshotPath).toBe(`${thread.workspaceId}/${thread.id}.webp`);
  const bytes = await downloadScreenshot(workspace.owner.client, thread.screenshotPath ?? "");
  return { thread, image: await decodeImage(page, bytes) };
}

async function extensionIdOf(context: BrowserContext): Promise<string> {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  return new URL(worker.url()).host;
}

test("the stored screenshot shows the commented element with the padding and without Sitenote", async ({
  context,
  extensionId,
}) => {
  const path = "/b/element";
  const session = await open(context, extensionId, path);
  const { page } = session;
  await expect(page.locator("#box")).toBeVisible();
  const ratio = await deviceScale(page);

  await commentOnElement(session, "#box", { x: 150, y: 60 }, "This box is the wrong color");

  const { image } = await storedImage(page, path);
  expect(image.width).toBe(Math.round((BOX_WIDTH + 2 * PADDING) * ratio));
  expect(image.height).toBe(Math.round((BOX_HEIGHT + 2 * PADDING) * ratio));
  expect(isColor(image.center, BOX_COLOR)).toBe(true);
  expect(isColor(image.topLeft, PAGE_COLOR)).toBe(true);
  expect(isColor(image.bottomRight, PAGE_COLOR)).toBe(true);
  await expect(page.getByText("Screenshot could not be saved")).toHaveCount(0);
});

test("the screenshot is cropped by the device pixel ratio on a 2x screen", async ({
  headless,
  baseURL,
}) => {
  const context = await launchExtensionContext(headless, baseURL, { deviceScaleFactor: 2 });
  try {
    const path = "/b/retina";
    const session = await open(context, await extensionIdOf(context), path);
    const { page } = session;
    expect(await deviceScale(page)).toBe(2);

    await commentOnElement(session, "#box", { x: 100, y: 40 }, "Retina check");

    const { image } = await storedImage(page, path);
    expect(image.width).toBe((BOX_WIDTH + 2 * PADDING) * 2);
    expect(image.height).toBe((BOX_HEIGHT + 2 * PADDING) * 2);
    expect(isColor(image.center, BOX_COLOR)).toBe(true);
  } finally {
    await context.close();
  }
});

test("an element that is partly below the fold is scrolled into view before the capture", async ({
  context,
  extensionId,
}) => {
  const path = "/b/fold?left=200&top=650";
  const session = await open(context, extensionId, path);
  const { page } = session;
  const ratio = await deviceScale(page);
  const viewport = await page.evaluate(() => ({
    height: window.innerHeight,
    scroll: window.scrollY,
  }));
  expect(viewport.scroll).toBe(0);
  expect(viewport.height).toBeLessThan(650 + BOX_HEIGHT);

  await enterCommentMode(session);
  await page.mouse.click(250, 660);
  await submitNewThread(page, "Cut off at the bottom");
  await expect(page.getByRole("dialog", { name: "Thread 1" })).toBeVisible();

  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const { image } = await storedImage(page, path);
  expect(image.width).toBe(Math.round((BOX_WIDTH + 2 * PADDING) * ratio));
  expect(image.height).toBe(Math.round((BOX_HEIGHT + 2 * PADDING) * ratio));
  expect(isColor(image.center, BOX_COLOR)).toBe(true);
});

test("the crop is clamped at the edge of the page", async ({ context, extensionId }) => {
  const path = "/b/edge?left=0&top=0";
  const session = await open(context, extensionId, path);
  const { page } = session;
  const ratio = await deviceScale(page);

  await enterCommentMode(session);
  await page.mouse.click(50, 50);
  await submitNewThread(page, "Top left corner");
  await expect(page.getByRole("dialog", { name: "Thread 1" })).toBeVisible();

  const { image } = await storedImage(page, path);
  expect(image.width).toBe(Math.round((BOX_WIDTH + PADDING) * ratio));
  expect(image.height).toBe(Math.round((BOX_HEIGHT + PADDING) * ratio));
  expect(isColor(image.topLeft, BOX_COLOR)).toBe(true);
  expect(isColor(image.bottomRight, PAGE_COLOR)).toBe(true);
});

test("a text comment stores a screenshot of the selected text", async ({
  context,
  extensionId,
}) => {
  const path = "/p/text-shot";
  const session = await open(context, extensionId, path);
  const { page } = session;
  await page.evaluate(() => {
    const lead = document.querySelector(".lead");
    const text = lead?.firstChild;
    if (text === null || text === undefined) {
      throw new Error("The lead paragraph is missing");
    }
    const range = document.createRange();
    range.setStart(text, 3);
    range.setEnd(text, 24);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });

  await hostOf(page).getByRole("button", { name: "Comment", exact: true }).click();
  await submitNewThread(page, "This sentence needs work");
  await expect(page.getByRole("dialog", { name: "Thread 1" })).toBeVisible();

  const { image } = await storedImage(page, path);
  expect(image.width).toBeGreaterThan(2 * PADDING);
  expect(image.height).toBeGreaterThan(2 * PADDING);
});

test("a failed upload still creates the thread, shows a toast and stores no path", async ({
  context,
  extensionId,
}) => {
  const path = "/b/failure";
  const session = await open(context, extensionId, path);
  const { page, popup } = session;
  expect(
    await evaluateIn(popup, `chrome.runtime.sendMessage({ type: "__test.failNextUpload" })`),
  ).toEqual({
    ok: true,
    data: null,
  });

  await commentOnElement(session, "#box", { x: 150, y: 60 }, "Upload will fail");

  await expect(page.getByText("Screenshot could not be saved")).toBeVisible();
  const thread = await onlyThread(workspace.owner.client, pageUrl(path));
  expect(thread.screenshotPath).toBeNull();
  expect(thread.context).not.toBeNull();
  await expect(
    page.getByRole("dialog", { name: "Thread 1" }).getByText("No screenshot saved."),
  ).toBeVisible();
});

test("the thread panel shows the screenshot and the context, also after a reload", async ({
  context,
  extensionId,
}) => {
  const path = "/b/panel";
  const session = await open(context, extensionId, path);
  const { page } = session;
  const size = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    ratio: window.devicePixelRatio,
  }));

  await commentOnElement(session, "#box", { x: 150, y: 60 }, "Look at the panel");

  const dialog = page.getByRole("dialog", { name: "Thread 1" });
  const section = dialog.getByRole("region", { name: "Page context" });
  await expect(section).toContainText(
    `${String(size.width)}×${String(size.height)} @${String(size.ratio)}x`,
  );
  await expect(section).toContainText("Box fixture");
  const thread = await onlyThread(workspace.owner.client, pageUrl(path));
  await expect(section).toContainText(thread.context?.browser.name ?? "missing");
  await expect(section).toContainText(thread.context?.os.name ?? "missing");
  const image = section.getByRole("img", { name: "Screenshot of the commented area" });
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(Math.round((BOX_WIDTH + 2 * PADDING) * size.ratio));

  const link = section.getByRole("link", { name: "Open the full screenshot in a new tab" });
  const [opened] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await opened.waitForLoadState();
  expect(opened.url()).toContain("/storage/v1/object/sign/screenshots/");
  await opened.close();

  await page.reload();
  await expect(hostOf(page)).toHaveAttribute("data-thread-count", "1");
  await pinOf(page, 1).click();
  const reopened = page
    .getByRole("dialog", { name: "Thread 1" })
    .getByRole("img", { name: "Screenshot of the commented area" });
  await expect
    .poll(() => reopened.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
});

test("console errors, rejections and console.error calls are stored with the thread", async ({
  context,
  extensionId,
}) => {
  const path = "/e/errors";
  const session = await open(context, extensionId, path);
  const { page } = session;
  await page.reload();
  await expect(hostOf(page)).toHaveAttribute("data-live", "true");
  await page.locator("#log-error").click();

  await commentOnElement(session, "#heading", { x: 20, y: 10 }, "Check the console");

  const thread = await onlyThread(workspace.owner.client, pageUrl(path));
  expect(threadContextSchema.safeParse(thread.rawContext).success).toBe(true);
  const errors = thread.context?.consoleErrors ?? [];
  const uncaught = errors.find((record) => record.kind === "error");
  expect(uncaught?.message).toContain("fixture uncaught error");
  expect(uncaught?.source).toContain("/errors.js");
  expect(errors.find((record) => record.kind === "unhandledrejection")?.message).toContain(
    "fixture unhandled rejection",
  );
  expect(errors.find((record) => record.kind === "console.error")?.message).toBe(
    "fixture console error {id: 7}",
  );
  expect(thread.context?.pageTitle).toBe("Errors fixture");
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  expect(thread.context?.viewport).toEqual(viewport);
  expect(thread.context?.url).toBe(`${FIXTURE_ORIGIN}${path}`);
  expect(["Windows", "macOS", "Linux"]).toContain(thread.context?.os.name);

  const panel = page.getByRole("dialog", { name: "Thread 1" }).getByRole("region", {
    name: "Page context",
  });
  await panel.getByText(/Console errors \(3\)/).click();
  await expect(panel.getByText("Uncaught Error: fixture uncaught error")).toBeVisible();
  await expect(panel.getByText("fixture console error {id: 7}")).toBeVisible();
});

test("switching console error capture off removes the errors from new threads and back on restores them", async ({
  context,
  extensionId,
}) => {
  const first = await open(context, extensionId, "/e/toggle-live");
  const { page, popup } = first;
  await page.locator("#log-error").click();
  await openSiteMenu(popup);
  const checkbox = popup.getByRole("checkbox", { name: "Capture console errors" });
  await expect(checkbox).toBeChecked();

  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  await expect(popup.getByRole("status")).toHaveText("Console errors will not be captured.");
  await popup.keyboard.press("Escape");
  await expect(popup.getByRole("button", { name: "More options" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await commentOnElement(first, "#heading", { x: 20, y: 10 }, "Errors are off");
  const live = await onlyThread(workspace.owner.client, pageUrl("/e/toggle-live"));
  expect(live.context?.consoleErrors).toEqual([]);

  const second = await context.newPage();
  await second.goto(`${FIXTURE_ORIGIN}/e/toggle-off`);
  await expect(hostOf(second)).toHaveAttribute("data-live", "true");
  await pointPopupAt(popup, extensionId, second, `${FIXTURE_ORIGIN}/e/toggle-off`);
  await second.locator("#log-error").click();
  await commentOnElement(
    { page: second, popup },
    "#heading",
    { x: 20, y: 10 },
    "Still off after a reload",
  );
  const off = await onlyThread(workspace.owner.client, pageUrl("/e/toggle-off"));
  expect(off.context?.consoleErrors).toEqual([]);

  await openSiteMenu(popup);
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await expect(popup.getByRole("status")).toHaveText("Console errors will be captured.");
  await popup.keyboard.press("Escape");
  await expect(popup.getByRole("button", { name: "More options" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  const third = await context.newPage();
  await third.goto(`${FIXTURE_ORIGIN}/e/toggle-on`);
  await expect(hostOf(third)).toHaveAttribute("data-live", "true");
  await pointPopupAt(popup, extensionId, third, `${FIXTURE_ORIGIN}/e/toggle-on`);
  await third.locator("#log-error").click();
  await commentOnElement({ page: third, popup }, "#heading", { x: 20, y: 10 }, "Errors are back");
  const on = await onlyThread(workspace.owner.client, pageUrl("/e/toggle-on"));
  expect(on.context?.consoleErrors.map((record) => record.kind)).toEqual(
    expect.arrayContaining(["error", "unhandledrejection", "console.error"]),
  );
});

test("only trusted extension pages can read the session storage, not the content script", async ({
  context,
  extensionId,
}) => {
  const session = await open(context, extensionId, "/b/storage");
  const { page, popup } = session;
  await expect(hostOf(page)).toHaveAttribute("data-live", "true");

  const trusted = await evaluateIn(
    popup,
    `chrome.storage.local.get(null).then((items) => Object.keys(items).filter((key) => key.startsWith("sitenote.auth.")).length)`,
  );
  expect(trusted).toBeGreaterThan(0);

  const cdp = await context.newCDPSession(page);
  const worlds: { id: number; name: string; origin: string }[] = [];
  cdp.on("Runtime.executionContextCreated", (event) => {
    worlds.push({
      id: event.context.id,
      name: event.context.name,
      origin: event.context.origin,
    });
  });
  await cdp.send("Runtime.enable");
  const world = worlds.find(
    (candidate) => candidate.origin.includes(extensionId) || candidate.name === "Sitenote",
  );
  expect(world, JSON.stringify(worlds)).toBeDefined();

  const result = await cdp.send("Runtime.evaluate", {
    contextId: world?.id ?? 0,
    expression: `(async () => {
      try {
        const items = await chrome.storage.local.get(null);
        return "allowed:" + Object.keys(items).join(",");
      } catch (error) {
        return "denied:" + String(error && error.message);
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  expect(String(result.result.value)).toMatch(/^denied:/);
  expect(String(result.result.value)).not.toContain("sitenote.auth.");
});

test("the pin of a new thread stays where the click was after the screenshot", async ({
  context,
  extensionId,
}) => {
  const path = "/b/pin";
  const session = await open(context, extensionId, path);
  const { page } = session;
  const box = await page.locator("#box").boundingBox();
  expect(box).not.toBeNull();

  await commentOnElement(session, "#box", { x: 150, y: 60 }, "Pin position");

  const pin = await centerOf(pinOf(page, 1));
  expect(Math.abs(pin.x - ((box?.x ?? 0) + 150))).toBeLessThanOrEqual(1);
  expect(Math.abs(pin.y - ((box?.y ?? 0) + 60))).toBeLessThanOrEqual(1);
});
