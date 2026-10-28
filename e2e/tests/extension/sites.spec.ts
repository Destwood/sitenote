import { SITENOTE_ROOT_TAG } from "@sitenote/core";
import type { BrowserContext, Page } from "@playwright/test";
import type { SitenoteClient } from "@sitenote/db";

import { expect, test } from "../../fixtures/extension";
import {
  enableSite,
  evaluateIn,
  openPopup,
  openSiteMenu,
  pointPopupAt,
  signIn,
  stopServiceWorker,
  tabIdOf,
} from "../../support/extension";
import { signInSeededUser } from "../../support/seeded-user";

const FIXTURE_ORIGIN = "http://127.0.0.1:4173";
const ROUTED_ORIGIN = "http://localhost:4999";
const GUEST_ROUTED_ORIGIN = "http://localhost:4998";
const OWNER = "owner@sitenote.test";
const MEMBER = "member@sitenote.test";
const GUEST = "guest@sitenote.test";
const WORKSPACE_NAME = "Northwind Studio";
const SEEDED_THREAD_COUNT = 4;
const SEEDED_COMMENT_COUNT = 8;

const ANCHOR = {
  kind: "element",
  selectors: { css: "main", nthPath: "body > main:nth-of-type(1)" },
  fingerprint: { tag: "main", text: "Hero", classes: [], width: 400, height: 300 },
  offset: { x: 0.5, y: 0.5 },
};

test.describe.configure({ mode: "serial" });

const cleanup: (() => Promise<void>)[] = [];

test.afterEach(async () => {
  for (const task of cleanup.splice(0)) {
    await task();
  }
});

function hostOf(page: Page) {
  return page.locator(SITENOTE_ROOT_TAG);
}

async function openFixtureAndPopup(
  context: BrowserContext,
  extensionId: string,
  email: string,
): Promise<{ page: Page; popup: Page }> {
  const popup = await openPopup(context, extensionId);
  await signIn(popup, email);
  const page = await context.newPage();
  await page.goto("/");
  await pointPopupAt(popup, extensionId, page, FIXTURE_ORIGIN);
  return { page, popup };
}

async function registeredScriptIds(popup: Page): Promise<string[]> {
  const scripts = await evaluateIn(popup, "chrome.scripting.getRegisteredContentScripts()");
  return Array.isArray(scripts)
    ? scripts.map((script: unknown) =>
        typeof script === "object" && script !== null && "id" in script ? String(script.id) : "",
      )
    : [];
}

async function createRemoteThread(client: SitenoteClient, body: string): Promise<string> {
  const siteId = "20000000-0000-4000-8000-000000000001";
  const { data, error } = await client.rpc("create_thread", {
    p_site_id: siteId,
    p_page_url: FIXTURE_ORIGIN,
    p_anchor: ANCHOR,
    p_context: {},
    p_body: body,
    p_mentions: [],
  });
  if (error !== null) {
    throw new Error(`create_thread failed: ${error.message}`);
  }
  const id: unknown = data.id;
  if (typeof id !== "string") {
    throw new Error("create_thread returned no id");
  }
  return id;
}

async function deleteThread(owner: SitenoteClient, id: string): Promise<void> {
  await owner.from("threads").delete().eq("id", id);
}

async function siteRows(owner: SitenoteClient, origin: string): Promise<number> {
  const { data, error } = await owner.from("sites").select("id").eq("origin", origin);
  if (error !== null) {
    throw new Error(error.message);
  }
  return data.length;
}

async function routeOrigin(context: BrowserContext, origin: string): Promise<void> {
  await context.route(`${origin}/**`, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><title>Routed</title><main><h1>Routed page</h1></main>",
    }),
  );
}

test("a signed-in owner enables Sitenote on the fixture site from the popup", async ({
  context,
  extensionId,
}) => {
  const { page, popup } = await openFixtureAndPopup(context, extensionId, OWNER);
  await expect(popup.getByTestId("site-origin")).toHaveText(new URL(FIXTURE_ORIGIN).host);
  await expect(popup.getByRole("button", { name: "Enable on this site" })).toBeEnabled();
  await expect(hostOf(page)).toHaveCount(0);

  await enableSite(popup, WORKSPACE_NAME);

  const host = hostOf(page);
  await expect(host).toHaveCount(1);
  await expect(host.getByRole("button", { name: "Comments, 3 open" })).toBeVisible();
  await expect(host).toHaveAttribute("data-thread-count", String(SEEDED_THREAD_COUNT));
  await expect(host).toHaveAttribute("data-comment-count", String(SEEDED_COMMENT_COUNT));
  await expect(host).toHaveAttribute("data-comment-mode", "off");
  await expect(host).toHaveAttribute("data-live", "true");
  expect((await registeredScriptIds(popup)).sort()).toEqual([
    `sitenote:errors:${FIXTURE_ORIGIN}`,
    `sitenote:${FIXTURE_ORIGIN}`,
  ]);
});

test("enabling survives a reload because the content script is registered", async ({
  context,
  extensionId,
}) => {
  const { page, popup } = await openFixtureAndPopup(context, extensionId, OWNER);
  await enableSite(popup, WORKSPACE_NAME);
  await expect(hostOf(page)).toHaveAttribute("data-thread-count", String(SEEDED_THREAD_COUNT));

  await page.reload();

  await expect(hostOf(page)).toHaveCount(1);
  await expect(hostOf(page)).toHaveAttribute("data-thread-count", String(SEEDED_THREAD_COUNT));
  await popup.reload();
  await expect(popup.getByTestId("site-state")).toHaveText(`Enabled in ${WORKSPACE_NAME}`);
});

test("injecting the content script a second time leaves a single overlay", async ({
  context,
  extensionId,
}) => {
  const { page, popup } = await openFixtureAndPopup(context, extensionId, OWNER);
  await enableSite(popup, WORKSPACE_NAME);
  await expect(hostOf(page)).toHaveAttribute("data-live", "true");
  const tabId = await tabIdOf(popup, FIXTURE_ORIGIN);

  await evaluateIn(
    popup,
    `chrome.scripting.executeScript({ target: { tabId: ${String(tabId)} }, files: ["/content-scripts/content.js"] })`,
  );

  await expect(hostOf(page)).toHaveCount(1);
  await expect(hostOf(page)).toHaveAttribute("data-thread-count", String(SEEDED_THREAD_COUNT));
  await expect(hostOf(page)).toHaveAttribute("data-live", "true");
});

test("an origin that was never enabled gets no injection", async ({ context }) => {
  const page = await context.newPage();

  await page.goto("/");
  await page.waitForLoadState("load");
  await page.waitForTimeout(1000);

  await expect(hostOf(page)).toHaveCount(0);
});

test("the comment mode button reaches the content script and toggles the attribute", async ({
  context,
  extensionId,
}) => {
  const { page, popup } = await openFixtureAndPopup(context, extensionId, OWNER);
  await enableSite(popup, WORKSPACE_NAME);
  const host = hostOf(page);
  await expect(host).toHaveAttribute("data-comment-mode", "off");

  await popup.getByRole("button", { name: "Comment mode" }).click();
  await expect(host).toHaveAttribute("data-comment-mode", "on");
  await expect(popup.getByRole("status")).toHaveText("Comment mode is on.");

  await popup.getByRole("button", { name: "Comment mode" }).click();
  await expect(host).toHaveAttribute("data-comment-mode", "off");
  await expect(popup.getByRole("status")).toHaveText("Comment mode is off.");
});

test("disabling removes the overlay, unregisters the script and survives a reload", async ({
  context,
  extensionId,
}) => {
  const { page, popup } = await openFixtureAndPopup(context, extensionId, OWNER);
  await enableSite(popup, WORKSPACE_NAME);
  await expect(hostOf(page)).toHaveCount(1);

  await openSiteMenu(popup);
  await popup.getByRole("button", { name: "Disable on this site" }).click();

  await expect(popup.getByTestId("site-state")).toHaveText("Not enabled");
  await expect(hostOf(page)).toHaveCount(0);
  expect(await registeredScriptIds(popup)).toEqual([]);

  await page.reload();
  await page.waitForLoadState("load");
  await page.waitForTimeout(1000);
  await expect(hostOf(page)).toHaveCount(0);
  await popup.reload();
  await expect(popup.getByTestId("site-state")).toHaveText("Not enabled");
});

test("an owner enabling a new origin registers the site in the workspace", async ({
  context,
  extensionId,
}) => {
  const owner = await signInSeededUser(OWNER);
  cleanup.push(async () => {
    await owner.from("sites").delete().eq("origin", ROUTED_ORIGIN);
  });
  expect(await siteRows(owner, ROUTED_ORIGIN)).toBe(0);
  await routeOrigin(context, ROUTED_ORIGIN);
  const popup = await openPopup(context, extensionId);
  await signIn(popup, OWNER);
  const page = await context.newPage();
  await page.goto(`${ROUTED_ORIGIN}/`);
  await pointPopupAt(popup, extensionId, page, ROUTED_ORIGIN);

  await enableSite(popup, WORKSPACE_NAME);

  await expect(hostOf(page)).toHaveAttribute("data-thread-count", "0");
  expect(await siteRows(owner, ROUTED_ORIGIN)).toBe(1);
});

test("a guest can enable a registered origin but not register a new one", async ({
  context,
  extensionId,
}) => {
  const owner = await signInSeededUser(OWNER);
  await routeOrigin(context, GUEST_ROUTED_ORIGIN);
  const popup = await openPopup(context, extensionId);
  await signIn(popup, GUEST);
  const unregistered = await context.newPage();
  await unregistered.goto(`${GUEST_ROUTED_ORIGIN}/`);
  await pointPopupAt(popup, extensionId, unregistered, GUEST_ROUTED_ORIGIN);

  await expect(popup.getByText("Guests can enable only sites")).toBeVisible();
  await popup.getByRole("button", { name: "Enable on this site" }).click();

  await expect(popup.getByRole("alert")).toContainText("do not have permission");
  await expect(popup.getByTestId("site-state")).toHaveText("Not enabled");
  expect(await siteRows(owner, GUEST_ROUTED_ORIGIN)).toBe(0);
  await expect(hostOf(unregistered)).toHaveCount(0);

  const registered = await context.newPage();
  await registered.goto("/");
  await pointPopupAt(popup, extensionId, registered, FIXTURE_ORIGIN);
  await enableSite(popup, WORKSPACE_NAME);
  await expect(hostOf(registered)).toHaveAttribute(
    "data-thread-count",
    String(SEEDED_THREAD_COUNT),
  );
});

test("the popup says Sitenote is unavailable on a page that cannot be scripted", async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);
  await signIn(popup, OWNER);
  const blank = await context.newPage();
  const hidden = await evaluateIn(
    popup,
    "chrome.tabs.query({}).then((tabs) => tabs.filter((tab) => tab.url === undefined).map((tab) => tab.id))",
  );
  const tabId: unknown = Array.isArray(hidden) ? hidden[0] : null;
  expect(typeof tabId).toBe("number");
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${String(tabId)}`);

  await expect(popup.getByTestId("site-unavailable")).toHaveText(
    "Sitenote is not available on this page.",
  );
  await expect(popup.getByRole("button", { name: "Enable on this site" })).toHaveCount(0);
  await blank.close();
});

test("a remote thread and a remote comment reach the page live", async ({
  context,
  extensionId,
}) => {
  const { page, popup } = await openFixtureAndPopup(context, extensionId, OWNER);
  await enableSite(popup, WORKSPACE_NAME);
  const host = hostOf(page);
  await expect(host).toHaveAttribute("data-live", "true");
  const owner = await signInSeededUser(OWNER);
  const member = await signInSeededUser(MEMBER);

  const threadId = await createRemoteThread(member, "A brand new remote thread");
  cleanup.push(() => deleteThread(owner, threadId));
  await expect(host).toHaveAttribute("data-thread-count", String(SEEDED_THREAD_COUNT + 1));
  await expect(host).toHaveAttribute("data-comment-count", String(SEEDED_COMMENT_COUNT + 1));

  const { error } = await member.from("comments").insert({
    thread_id: threadId,
    workspace_id: "10000000-0000-4000-8000-000000000001",
    author_id: (await member.auth.getUser()).data.user?.id ?? "",
    body: "A remote reply",
  });
  expect(error).toBeNull();
  await expect(host).toHaveAttribute("data-comment-count", String(SEEDED_COMMENT_COUNT + 2));
});

test("realtime keeps working after the service worker is stopped", async ({
  context,
  extensionId,
}) => {
  const { page, popup } = await openFixtureAndPopup(context, extensionId, OWNER);
  await enableSite(popup, WORKSPACE_NAME);
  const host = hostOf(page);
  await expect(host).toHaveAttribute("data-live", "true");
  const owner = await signInSeededUser(OWNER);
  const member = await signInSeededUser(MEMBER);

  await stopServiceWorker(context, popup);

  await expect(host).toHaveAttribute("data-live", "false");
  await expect(host).toHaveAttribute("data-live", "true", { timeout: 20_000 });
  const threadId = await createRemoteThread(member, "A thread after the worker restarted");
  cleanup.push(() => deleteThread(owner, threadId));
  await expect(host).toHaveAttribute("data-thread-count", String(SEEDED_THREAD_COUNT + 1));
});

test("the background refuses page requests from an extension page and unknown requests", async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);
  await signIn(popup, OWNER);

  const list = await evaluateIn(
    popup,
    `chrome.runtime.sendMessage({ type: "threads.list", siteId: "20000000-0000-4000-8000-000000000001", pageUrl: "${FIXTURE_ORIGIN}" })`,
  );
  const unknown = await evaluateIn(
    popup,
    `chrome.runtime.sendMessage({ type: "threads.deleteEverything" })`,
  );
  const workspaces = await evaluateIn(
    popup,
    `chrome.runtime.sendMessage({ type: "workspaces.list" })`,
  );

  expect(list).toMatchObject({ ok: false, error: { code: "forbidden" } });
  expect(unknown).toMatchObject({ ok: false, error: { code: "invalid_request" } });
  expect(workspaces).toMatchObject({
    ok: true,
    data: [{ name: WORKSPACE_NAME, role: "owner" }],
  });
});
