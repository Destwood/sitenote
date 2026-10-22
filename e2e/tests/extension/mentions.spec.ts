import type { BrowserContext, Page } from "@playwright/test";

import { expect, test } from "../../fixtures/extension";
import {
  FIXTURE_ORIGIN,
  commentOnElement,
  enterCommentMode,
  hostOf,
  openInSecondContext,
  openReviewPage,
  pinOf,
} from "../../support/comments";
import { evaluateIn, openPopup } from "../../support/extension";
import {
  createFreshWorkspace,
  deleteFreshWorkspace,
  type FreshWorkspace,
} from "../../support/fresh-workspace";

test.describe.configure({ mode: "default" });

const cleanup: (() => Promise<void>)[] = [];

test.afterEach(async () => {
  for (const task of cleanup.splice(0)) {
    await task();
  }
});

async function freshWorkspace(): Promise<FreshWorkspace> {
  const workspace = await createFreshWorkspace("Olena Owner", "Max Member");
  cleanup.push(() => deleteFreshWorkspace(workspace));
  return workspace;
}

function extensionIdOf(context: BrowserContext): string {
  const worker = context.serviceWorkers()[0];
  if (worker === undefined) {
    throw new Error("The extension worker is not running");
  }
  return new URL(worker.url()).host;
}

async function badgeText(popup: Page): Promise<string> {
  const text = await evaluateIn(popup, "chrome.action.getBadgeText({})");
  if (typeof text !== "string") {
    throw new Error("The badge text is not a string");
  }
  return text;
}

test("a mention picked from the list notifies the owner, a reply notifies the creator, and the badge follows", async ({
  context,
  extensionId,
  headless,
  baseURL,
}) => {
  test.setTimeout(150_000);
  const workspace = await freshWorkspace();
  const path = "/p/mentions";
  const memberSession = await openReviewPage(
    context,
    extensionId,
    workspace.member.email,
    path,
    FIXTURE_ORIGIN,
    workspace.workspaceName,
  );
  const second = await openInSecondContext(
    headless,
    baseURL,
    workspace.owner.email,
    path,
    workspace.workspaceName,
  );
  try {
    const ownerSession = second.session;
    const ownerPopup = await openPopup(second.context, extensionIdOf(second.context));
    await expect(ownerPopup.getByRole("tab", { name: "Notifications" })).toBeVisible();
    expect(await badgeText(ownerPopup)).toBe("");
    const memberPopup = await openPopup(context, extensionId);
    await expect(memberPopup.getByRole("tab", { name: "Notifications" })).toBeVisible();

    await enterCommentMode(memberSession);
    await memberSession.page.locator("#cta").click({ position: { x: 25, y: 15 } });
    const newThread = memberSession.page.getByRole("dialog", { name: "New thread" });
    const comment = newThread.getByRole("textbox", { name: "Comment" });
    await comment.pressSequentially("@Ol");
    await expect(newThread.getByRole("listbox", { name: "Mention suggestions" })).toBeVisible();
    await expect(newThread.getByRole("option")).toHaveCount(1);
    await expect(newThread.getByRole("option", { name: "Olena Owner" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await comment.press("Enter");
    await expect(comment).toHaveValue("@Olena Owner ");
    await comment.pressSequentially("please check this");
    await newThread.getByRole("button", { name: "Comment", exact: true }).click();

    const memberThread = memberSession.page.getByRole("dialog", { name: "Thread 1" });
    await expect(memberThread.locator("[data-mention]")).toHaveText("@Olena Owner");
    const stored = await workspace.owner.client
      .from("comments")
      .select("body, mentions")
      .eq("workspace_id", workspace.workspaceId);
    expect(stored.error).toBeNull();
    expect(stored.data).toEqual([
      { body: "@Olena Owner please check this", mentions: [workspace.owner.id] },
    ]);

    await expect.poll(() => badgeText(ownerPopup)).toBe("1");
    const ownerTab = ownerPopup.getByRole("tab", { name: "Notifications (1)" });
    await expect(ownerTab).toBeVisible();
    await ownerTab.click();
    const mention = ownerPopup.getByTestId("notification-item");
    await expect(mention).toHaveCount(1);
    await expect(mention).toHaveAttribute("data-unread", "true");
    await expect(mention).toContainText("Max Member mentioned you");
    await expect(mention).toContainText("please check this");
    await expect(mention).toContainText("127.0.0.1:4173/p/mentions");

    const [opened] = await Promise.all([second.context.waitForEvent("page"), mention.click()]);
    await expect.poll(() => opened.url()).toBe(`${FIXTURE_ORIGIN}${path}`);
    await expect.poll(() => badgeText(ownerPopup)).toBe("");
    await expect(mention).toHaveAttribute("data-unread", "false");
    await expect(ownerPopup.getByRole("tab", { name: "Notifications", exact: true })).toBeVisible();

    await expect(pinOf(ownerSession.page, 1)).toBeVisible();
    await pinOf(ownerSession.page, 1).click();
    const ownerThread = ownerSession.page.getByRole("dialog", { name: "Thread 1" });
    await expect(ownerThread.locator("[data-mention]")).toHaveText("@Olena Owner");
    await ownerThread.getByRole("textbox", { name: "Reply" }).fill("Thanks, on it");
    await ownerThread.getByRole("button", { name: "Reply", exact: true }).click();
    await expect(ownerThread).toContainText("Thanks, on it");

    await expect.poll(() => badgeText(memberPopup)).toBe("1");
    await memberPopup.getByRole("tab", { name: "Notifications (1)" }).click();
    const reply = memberPopup.getByTestId("notification-item");
    await expect(reply).toHaveCount(1);
    await expect(reply).toHaveAttribute("data-unread", "true");
    await expect(reply).toContainText("Olena Owner replied in a thread");
    await expect(reply).toContainText("Thanks, on it");
    expect(await badgeText(ownerPopup)).toBe("");

    await memberPopup.getByRole("button", { name: "Mark all as read" }).click();
    await expect.poll(() => badgeText(memberPopup)).toBe("");
    await expect(reply).toHaveAttribute("data-unread", "false");
    await expect(memberPopup.getByTestId("notifications-summary")).toHaveText(
      "You are all caught up.",
    );
    await expect(
      memberPopup.getByRole("tab", { name: "Notifications", exact: true }),
    ).toBeVisible();
  } finally {
    await second.context.close();
  }
});

test("resolved pins stay hidden until the toggle is on, and the choice survives a reload", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(90_000);
  const workspace = await freshWorkspace();
  const session = await openReviewPage(
    context,
    extensionId,
    workspace.owner.email,
    "/p/resolved-toggle",
    FIXTURE_ORIGIN,
    workspace.workspaceName,
  );
  const { page } = session;
  await commentOnElement(session, "#cta", { x: 25, y: 15 }, "Needs a decision");
  const dialog = page.getByRole("dialog", { name: "Thread 1" });
  await dialog.getByRole("button", { name: "Resolve" }).click();
  await expect(dialog.getByRole("button", { name: "Reopen" })).toBeVisible();
  await page.getByRole("button", { name: "Close thread" }).click();
  await expect(pinOf(page, 1, "resolved")).toHaveCount(0);

  await page.getByRole("button", { name: /^Comments, / }).click();
  await expect(page.getByText("0 open · 1 resolved")).toBeVisible();
  await expect(page.getByText("Needs a decision")).toHaveCount(0);
  await page.getByRole("button", { name: "Show resolved (1)" }).click();
  await expect(page.getByText("Needs a decision")).toBeVisible();
  await expect(pinOf(page, 1, "resolved")).toBeVisible();

  await page.reload();
  await expect(hostOf(page)).toHaveAttribute("data-live", "true");
  await expect(pinOf(page, 1, "resolved")).toBeVisible();
  await page.getByRole("button", { name: /^Comments, / }).click();
  await page.getByRole("button", { name: "Hide resolved (1)" }).click();
  await expect(pinOf(page, 1, "resolved")).toHaveCount(0);

  await page.reload();
  await expect(hostOf(page)).toHaveAttribute("data-live", "true");
  await expect(page.getByRole("button", { name: "Comments, 0 open" })).toBeVisible();
  await expect(pinOf(page, 1, "resolved")).toHaveCount(0);
  await page.getByRole("button", { name: /^Comments, / }).click();
  await expect(page.getByRole("button", { name: "Show resolved (1)" })).toBeVisible();
});
