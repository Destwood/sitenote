import type { Page } from "@playwright/test";
import type { SitenoteClient } from "@sitenote/db";

import { expect, launchExtensionContext, test } from "../../fixtures/extension";
import {
  FIXTURE_ORIGIN,
  MEMBER,
  OWNER,
  WORKSPACE_NAME,
  centerOf,
  commentOnElement,
  deleteThreadsOnPage,
  enterCommentMode,
  exitCommentMode,
  hostOf,
  openReviewPage,
  pinOf,
  submitNewThread,
  threadsOnPage,
} from "../../support/comments";
import { enableSite, openPopup, pointPopupAt, signIn } from "../../support/extension";
import { signInSeededUser } from "../../support/seeded-user";

test.describe.configure({ mode: "default" });

const cleanup: (() => Promise<void>)[] = [];

test.afterEach(async () => {
  for (const task of cleanup.splice(0)) {
    await task();
  }
});

async function ownerCleanup(...pageUrls: string[]): Promise<SitenoteClient> {
  const owner = await signInSeededUser(OWNER);
  cleanup.push(async () => {
    for (const pageUrl of pageUrls) {
      await deleteThreadsOnPage(owner, pageUrl);
    }
  });
  return owner;
}

function expectNear(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
}

async function installClickCounter(page: Page, selector: string): Promise<void> {
  await page.evaluate((target) => {
    Reflect.set(window, "pageClicks", 0);
    document.querySelector(target)?.addEventListener("click", () => {
      Reflect.set(window, "pageClicks", Number(Reflect.get(window, "pageClicks")) + 1);
    });
  }, selector);
}

async function pageClicks(page: Page): Promise<number> {
  return page.evaluate(() => Number(Reflect.get(window, "pageClicks")));
}

test("comment on an element: hover, click, submit, and the pin is restored after a reload", async ({
  context,
  extensionId,
}) => {
  const path = "/p/element-comment";
  const owner = await ownerCleanup(`${FIXTURE_ORIGIN}${path}`);
  const session = await openReviewPage(context, extensionId, OWNER, path);
  const { page } = session;
  await installClickCounter(page, "#cta");

  await enterCommentMode(session);
  const cta = page.locator("#cta");
  await cta.hover();
  const highlight = hostOf(page).getByTestId("sitenote-highlight");
  await expect(highlight).toBeVisible();
  const ctaBox = await cta.boundingBox();
  const highlightBox = await highlight.boundingBox();
  expect(ctaBox).not.toBeNull();
  expect(highlightBox?.x).toBeCloseTo(ctaBox?.x ?? -1, 0);
  expect(highlightBox?.y).toBeCloseTo(ctaBox?.y ?? -1, 0);
  expect(highlightBox?.width).toBeCloseTo(ctaBox?.width ?? -1, 0);

  await cta.click({ position: { x: 20, y: 10 } });
  expect(await pageClicks(page)).toBe(0);
  await expect(pinOf(page, 1, "pending")).toBeVisible();
  const clickPoint = { x: (ctaBox?.x ?? 0) + 20, y: (ctaBox?.y ?? 0) + 10 };
  const pendingCenter = await centerOf(pinOf(page, 1, "pending"));
  expectNear(pendingCenter.x, clickPoint.x);
  expectNear(pendingCenter.y, clickPoint.y);

  await submitNewThread(page, "The button label should be clearer");
  await expect(pinOf(page, 1)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Thread 1" })).toContainText(
    "The button label should be clearer",
  );
  const placed = await centerOf(pinOf(page, 1));
  expectNear(placed.x, clickPoint.x);
  expectNear(placed.y, clickPoint.y);
  expect(await threadsOnPage(owner, `${FIXTURE_ORIGIN}${path}`)).toHaveLength(1);

  await page.reload();

  await expect(hostOf(page)).toHaveAttribute("data-thread-count", "1");
  await expect(pinOf(page, 1)).toBeVisible();
  const restored = await centerOf(pinOf(page, 1));
  expectNear(restored.x, clickPoint.x);
  expectNear(restored.y, clickPoint.y);
});

test("comment on selected text: the Comment button creates a highlighted thread", async ({
  context,
  extensionId,
}) => {
  const path = "/p/text-comment";
  const owner = await ownerCleanup(`${FIXTURE_ORIGIN}${path}`);
  const session = await openReviewPage(context, extensionId, OWNER, path);
  const { page } = session;

  await page.locator(".lead").click({ clickCount: 3 });
  const selectionButton = page.getByRole("button", { name: "Comment", exact: true });
  await expect(selectionButton).toBeVisible();
  await selectionButton.click();
  await submitNewThread(page, "Please soften this sentence");

  await expect(pinOf(page, 1)).toBeVisible();
  await expect.poll(() => page.evaluate(() => CSS.highlights.has("sitenote"))).toBe(true);
  const threads = await threadsOnPage(owner, `${FIXTURE_ORIGIN}${path}`);
  expect(threads).toHaveLength(1);
  expect(threads[0]?.anchor).toMatchObject({ kind: "text" });

  await page.reload();

  await expect(pinOf(page, 1)).toBeVisible();
  await expect.poll(() => page.evaluate(() => CSS.highlights.has("sitenote"))).toBe(true);
});

test("reply, edit and delete your own comments", async ({ context, extensionId }) => {
  const path = "/p/replies";
  await ownerCleanup(`${FIXTURE_ORIGIN}${path}`);
  const session = await openReviewPage(context, extensionId, OWNER, path);
  const { page } = session;
  await commentOnElement(session, "#cta", { x: 30, y: 12 }, "First comment");
  const dialog = page.getByRole("dialog", { name: "Thread 1" });
  const comments = dialog.getByRole("listitem");

  await dialog.getByRole("textbox", { name: "Reply" }).fill("A reply with a typo");
  await dialog.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(comments).toHaveCount(2);
  const reply = comments.nth(1);
  await expect(reply).toContainText("A reply with a typo");

  await reply.getByRole("button", { name: "Edit" }).click();
  await reply.getByRole("textbox", { name: "Edit comment" }).fill("A reply without a typo");
  await reply.getByRole("button", { name: "Save" }).click();
  await expect(reply).toContainText("A reply without a typo");
  await expect(reply.getByText("edited")).toBeVisible();

  await reply.getByRole("button", { name: "Delete" }).click();
  await reply
    .getByRole("group", { name: "Confirm deletion" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(reply).toContainText("Comment deleted");
  await expect(reply).not.toContainText("A reply without a typo");
  await expect(comments.first()).toContainText("First comment");
});

test("a thread whose element disappears moves to the orphaned list", async ({
  context,
  extensionId,
}) => {
  const path = "/p/orphan";
  await ownerCleanup(`${FIXTURE_ORIGIN}${path}`);
  const session = await openReviewPage(context, extensionId, OWNER, path);
  const { page } = session;
  await commentOnElement(session, "#cta", { x: 30, y: 12 }, "Where did the button go");
  await page.getByRole("button", { name: "Close thread" }).click();
  await expect(pinOf(page, 1)).toBeVisible();

  await page.evaluate(() => {
    document.querySelector("#cta")?.remove();
  });

  await expect(pinOf(page, 1)).toHaveCount(0);
  await page.getByRole("button", { name: /^Comments, \d+ open$/ }).click();
  const orphaned = page.getByRole("region", { name: "Orphaned" });
  await expect(orphaned).toBeVisible();
  await expect(orphaned).toContainText("Where did the button go");
  await orphaned.getByRole("button").click();
  await expect(page.getByRole("dialog", { name: "Thread 1" })).toContainText(
    "Where did the button go",
  );
});

test("threads follow the URL of a single page app", async ({ context, extensionId }) => {
  const first = `${FIXTURE_ORIGIN}/spa.html`;
  const second = `${FIXTURE_ORIGIN}/spa/second`;
  await ownerCleanup(first, second);
  const session = await openReviewPage(context, extensionId, MEMBER, "/spa.html");
  const { page } = session;
  await commentOnElement(session, "#spa-action", { x: 20, y: 10 }, "Comment on the first page");
  await page.getByRole("button", { name: "Close thread" }).click();
  await expect(pinOf(page, 1)).toBeVisible();
  await exitCommentMode(page);

  await page.getByRole("link", { name: "Second page" }).click();

  await expect(page).toHaveURL(second);
  await expect(pinOf(page, 1)).toHaveCount(0);
  await expect(hostOf(page)).toHaveAttribute("data-thread-count", "0");
  await enterCommentMode(session);
  await page.locator("#spa-action").click({ position: { x: 20, y: 10 } });
  await submitNewThread(page, "Comment on the second page");
  await expect(pinOf(page, 1)).toBeVisible();
  await expect(hostOf(page)).toHaveAttribute("data-thread-count", "1");
  await page.getByRole("button", { name: "Close thread" }).click();
  await exitCommentMode(page);

  await page.getByRole("link", { name: "First page" }).click();

  await expect(page).toHaveURL(first);
  await expect(hostOf(page)).toHaveAttribute("data-thread-count", "1");
  await page.getByRole("button", { name: "Thread 1, open" }).click();
  await expect(page.getByRole("dialog", { name: "Thread 1" })).toContainText(
    "Comment on the first page",
  );
});

test("two users on the same page see each other's pins and replies live", async ({
  context,
  extensionId,
  headless,
  baseURL,
}) => {
  const path = "/p/realtime";
  await ownerCleanup(`${FIXTURE_ORIGIN}${path}`);
  const ownerSession = await openReviewPage(context, extensionId, OWNER, path);
  const memberContext = await launchExtensionContext(headless, baseURL);
  try {
    const memberWorker =
      memberContext.serviceWorkers()[0] ?? (await memberContext.waitForEvent("serviceworker"));
    const memberExtensionId = new URL(memberWorker.url()).host;
    const memberSession = await openReviewPage(memberContext, memberExtensionId, MEMBER, path);
    await expect(pinOf(memberSession.page, 1)).toHaveCount(0);

    await commentOnElement(ownerSession, "#cta", { x: 25, y: 15 }, "Owner starts a thread");

    await expect(pinOf(memberSession.page, 1)).toBeVisible();
    await pinOf(memberSession.page, 1).click();
    const memberDialog = memberSession.page.getByRole("dialog", { name: "Thread 1" });
    await expect(memberDialog).toContainText("Owner starts a thread");
    await memberDialog.getByRole("textbox", { name: "Reply" }).fill("Member replies live");
    await memberDialog.getByRole("button", { name: "Reply", exact: true }).click();

    const ownerDialog = ownerSession.page.getByRole("dialog", { name: "Thread 1" });
    await expect(ownerDialog).toContainText("Member replies live");
  } finally {
    await memberContext.close();
  }
});

test("a thread on the real public site example.com is created and restored", async ({
  context,
  extensionId,
}) => {
  const origin = "https://example.com";
  const owner = await signInSeededUser(OWNER);
  cleanup.push(async () => {
    const { error } = await owner.from("sites").delete().eq("origin", origin);
    if (error !== null) {
      throw new Error(`Cleanup of ${origin} failed: ${error.message}`);
    }
  });
  const popup = await openPopup(context, extensionId);
  await signIn(popup, OWNER);
  const page = await context.newPage();
  const response = await page.goto(`${origin}/`);
  expect(response?.ok()).toBe(true);
  await pointPopupAt(popup, extensionId, page, `${origin}/`);
  await enableSite(popup, WORKSPACE_NAME);
  await expect(hostOf(page)).toHaveAttribute("data-live", "true");
  const session = { page, popup };

  await commentOnElement(
    session,
    "p >> nth=0",
    { x: 40, y: 10 },
    "This explanation could be shorter",
  );
  await page.getByRole("button", { name: "Close thread" }).click();
  await expect(pinOf(page, 1)).toBeVisible();

  await page.reload();

  await expect(hostOf(page)).toHaveAttribute("data-thread-count", "1");
  await expect(pinOf(page, 1)).toBeVisible();
});
