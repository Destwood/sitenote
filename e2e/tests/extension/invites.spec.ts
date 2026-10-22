import { createSitenoteClient, type SitenoteClient } from "@sitenote/db";
import type { BrowserContext, Page } from "@playwright/test";

import { expect, test } from "../../fixtures/extension";
import {
  FIXTURE_ORIGIN,
  MEMBER,
  OWNER,
  WORKSPACE_NAME,
  commentOnElement,
  deleteThreadsOnPage,
  hostOf,
  pinOf,
} from "../../support/comments";
import {
  enableSite,
  evaluateIn,
  isRecord,
  openPopup,
  pointPopupAt,
  signIn,
} from "../../support/extension";
import {
  SEEDED_WORKSPACE_ID,
  createInviteToken,
  inviteUrl,
  removeGuestsNamed,
  revokeInviteToken,
} from "../../support/invites";
import { signInSeededUser } from "../../support/seeded-user";
import { readSupabaseEnv } from "../../support/supabase-env";
import { WEB_ORIGIN } from "../../support/web-auth";

const GUEST_NAME = "Gina Client";
const STORAGE_PREFIX = "sitenote.auth.";
const ANCHOR = {
  kind: "element",
  selectors: {
    css: "#cta",
    nthPath: "body > main:nth-of-type(1) > section:nth-of-type(1) > button:nth-of-type(1)",
    id: "cta",
  },
  fingerprint: { tag: "button", text: "Book a call", classes: ["cta"], width: 127, height: 50 },
  offset: { x: 0.5, y: 0.5 },
};

test.describe.configure({ mode: "default" });

const cleanup: (() => Promise<void>)[] = [];

test.afterEach(async () => {
  for (const task of cleanup.splice(0)) {
    await task();
  }
});

async function ownerWithInvite(): Promise<{ owner: SitenoteClient; link: string }> {
  const owner = await signInSeededUser(OWNER);
  const token = await createInviteToken(owner, SEEDED_WORKSPACE_ID, "guest");
  cleanup.push(async () => {
    await revokeInviteToken(owner, token);
    await removeGuestsNamed(owner, GUEST_NAME);
  });
  return { owner, link: inviteUrl(token) };
}

async function joinAsGuest(context: BrowserContext, link: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(link);
  await page.getByLabel("Your name").fill(GUEST_NAME);
  await page.getByRole("button", { name: "Join as guest" }).click();
  return page;
}

async function createOwnerThread(
  owner: SitenoteClient,
  pageUrl: string,
  body: string,
): Promise<string> {
  const { data, error } = await owner.rpc("create_thread", {
    p_site_id: "20000000-0000-4000-8000-000000000001",
    p_page_url: pageUrl,
    p_anchor: ANCHOR,
    p_context: {},
    p_body: body,
    p_mentions: [],
  });
  if (error !== null) {
    throw new Error(`create_thread failed: ${error.message}`);
  }
  return data.id;
}

async function storedAccessToken(popup: Page): Promise<string> {
  const raw = await evaluateIn(
    popup,
    `chrome.storage.local.get(null).then((all) => {
      const key = Object.keys(all).find((k) => k.startsWith("${STORAGE_PREFIX}") && k.endsWith("-auth-token"));
      return key === undefined ? null : all[key];
    })`,
  );
  const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : null;
  if (!isRecord(parsed) || typeof parsed.access_token !== "string") {
    throw new Error("The extension holds no session");
  }
  return parsed.access_token;
}

async function webAuthCookies(context: BrowserContext): Promise<string[]> {
  const cookies = await context.cookies(WEB_ORIGIN);
  return cookies.filter((cookie) => cookie.name.startsWith("sb-")).map((cookie) => cookie.name);
}

test("a guest joins from the invite link, the extension takes over the session and the guest comments", async ({
  context,
  extensionId,
}) => {
  const { owner, link } = await ownerWithInvite();
  const path = "/p/guest-invite";
  cleanup.push(() => deleteThreadsOnPage(owner, `${FIXTURE_ORIGIN}${path}`));

  const joinPage = await joinAsGuest(context, link);

  await expect(joinPage.getByTestId("extension-connected")).toBeVisible();
  await expect(
    joinPage.getByRole("heading", { name: `You joined ${WORKSPACE_NAME}` }),
  ).toBeVisible();
  await expect(joinPage.getByRole("link", { name: `Open ${FIXTURE_ORIGIN}` })).toBeVisible();
  await expect(
    joinPage.getByText("click the Sitenote icon on that site and choose Enable"),
  ).toBeVisible();
  await expect.poll(() => webAuthCookies(context)).toEqual([]);

  await joinPage.goto(`${WEB_ORIGIN}/app`);
  await expect(joinPage).toHaveURL(/\/sign-in\?next=/);

  const popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId("display-name")).toHaveText(GUEST_NAME);
  await expect(popup.getByTestId("account-email")).toHaveText("Guest session");

  const page = await context.newPage();
  await page.goto(path);
  await pointPopupAt(popup, extensionId, page, `${FIXTURE_ORIGIN}${path}`);
  await enableSite(popup, WORKSPACE_NAME);
  await expect(hostOf(page)).toHaveAttribute("data-live", "true");
  await commentOnElement({ page, popup }, "#cta", { x: 25, y: 15 }, "Hello from the guest");

  const { data, error } = await owner
    .from("threads")
    .select("comments(body, author:profiles!comments_author_id_fkey(display_name))")
    .eq("page_url", `${FIXTURE_ORIGIN}${path}`);
  expect(error).toBeNull();
  expect(data).toEqual([
    { comments: [{ body: "Hello from the guest", author: { display_name: GUEST_NAME } }] },
  ]);
});

test("a guest cannot resolve the owner's thread from the extension", async ({
  context,
  extensionId,
}) => {
  const { owner, link } = await ownerWithInvite();
  const path = "/p/guest-resolve";
  const pageUrl = `${FIXTURE_ORIGIN}${path}`;
  const threadId = await createOwnerThread(owner, pageUrl, "Owner asks a question");
  cleanup.push(() => deleteThreadsOnPage(owner, pageUrl));

  const joinPage = await joinAsGuest(context, link);
  await expect(joinPage.getByTestId("extension-connected")).toBeVisible();

  const popup = await openPopup(context, extensionId);
  const page = await context.newPage();
  await page.goto(path);
  await pointPopupAt(popup, extensionId, page, pageUrl);
  await enableSite(popup, WORKSPACE_NAME);

  await expect(pinOf(page, 1)).toBeVisible();
  await pinOf(page, 1).click();
  const dialog = page.getByRole("dialog", { name: "Thread 1" });
  await expect(dialog).toContainText("Owner asks a question");
  await expect(dialog.getByRole("button", { name: "Resolve" })).toHaveCount(0);

  const response = await evaluateIn(
    popup,
    `chrome.runtime.sendMessage({ type: "threads.setStatus", threadId: "${threadId}", status: "resolved" })`,
  );
  expect(response).toMatchObject({ ok: false });
  expect(JSON.stringify(response)).toMatch(/"code":"(forbidden|not_found)"/);

  const { url, publishableKey } = readSupabaseEnv();
  const asGuest = createSitenoteClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${await storedAccessToken(popup)}` } },
  });
  const update = await asGuest
    .from("threads")
    .update({ status: "resolved" })
    .eq("id", threadId)
    .select("id");
  expect(update.error).toBeNull();
  expect(update.data).toEqual([]);

  const { data } = await owner.from("threads").select("status").eq("id", threadId).single();
  expect(data?.status).toBe("open");
});

test("the extension keeps a signed-in member and the page explains how to switch", async ({
  context,
  extensionId,
}) => {
  const { link } = await ownerWithInvite();
  const popup = await openPopup(context, extensionId);
  await signIn(popup, MEMBER);

  const joinPage = await joinAsGuest(context, link);

  await expect(
    joinPage.getByRole("heading", { name: `You joined ${WORKSPACE_NAME}` }),
  ).toBeVisible();
  await expect(joinPage.getByText("already signed in to an account")).toBeVisible();
  await expect(joinPage.getByRole("button", { name: "Connect again" })).toBeVisible();
  await expect(joinPage.getByTestId("extension-connected")).toHaveCount(0);
  expect((await webAuthCookies(context)).length).toBeGreaterThan(0);

  await popup.reload();
  await expect(popup.getByTestId("display-name")).toHaveText("Max Member");
  await expect(popup.getByTestId("account-email")).toHaveText(MEMBER);

  await joinPage.goto(`${WEB_ORIGIN}/app`);
  await expect(joinPage.getByRole("listitem").filter({ hasText: WORKSPACE_NAME })).toContainText(
    "Guest",
  );
});

test("a guest session that was kept on the web connects after the extension signs out", async ({
  context,
  extensionId,
}) => {
  const { link } = await ownerWithInvite();
  const popup = await openPopup(context, extensionId);
  await signIn(popup, MEMBER);
  const joinPage = await joinAsGuest(context, link);
  await expect(joinPage.getByRole("button", { name: "Connect again" })).toBeVisible();

  await popup.getByRole("button", { name: "Sign out" }).click();
  await expect(popup.getByLabel("Email")).toBeVisible();
  await joinPage.getByRole("button", { name: "Connect again" }).click();

  await expect(joinPage.getByTestId("extension-connected")).toBeVisible();
  await expect.poll(() => webAuthCookies(context)).toEqual([]);
  await popup.reload();
  await expect(popup.getByTestId("display-name")).toHaveText(GUEST_NAME);
});
