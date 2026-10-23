import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { newEmail } from "../../support/extension";
import {
  INVALID_INVITE_TEXT,
  SEEDED_WORKSPACE_ID,
  createInviteToken,
  inviteUrl,
  removeGuestsNamed,
  revokeInviteToken,
} from "../../support/invites";
import { signInSeededUser } from "../../support/seeded-user";
import { WEB_ORIGIN, requestWebCode, signInOnWeb } from "../../support/web-auth";

const OWNER = "owner@sitenote.test";
const GUEST_NAME = "Gina Client";
const SEEDED_WORKSPACE_NAME = "Northwind Studio";
const FIXTURE_ORIGIN = "http://127.0.0.1:4173";
const LINK_PATTERN = new RegExp(`^${WEB_ORIGIN}/invite/[0-9a-f]{48}$`);

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const cleanup: (() => Promise<void>)[] = [];

test.afterEach(async () => {
  for (const task of cleanup.splice(0)) {
    await task();
  }
});

async function createWorkspaceAsNewOwner(page: Page): Promise<string> {
  const name = `Invites ${randomUUID()}`;
  await signInOnWeb(page, newEmail());
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app`);
  await page.getByLabel("Workspace name").fill(name);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  return name;
}

async function openInvites(page: Page, workspaceName: string): Promise<void> {
  await page
    .getByRole("listitem")
    .filter({ hasText: workspaceName })
    .getByRole("link", { name: "Invites", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: `Invites for ${workspaceName}` })).toBeVisible();
}

async function createInviteViaUi(page: Page, role: "Member" | "Guest"): Promise<void> {
  const rows = page.getByTestId("invite-row");
  const before = await rows.count();
  await page.getByLabel("Role").selectOption({ label: role });
  await page.getByRole("button", { name: "Create invite link" }).click();
  await expect(rows).toHaveCount(before + 1);
}

async function copyNewestLink(page: Page): Promise<string> {
  await page.getByTestId("invite-row").first().getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Link copied." })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(LINK_PATTERN);
  return link;
}

async function visitorPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("an owner creates a guest invite, copies the link and revokes it", async ({
  page,
  browser,
}) => {
  const workspaceName = await createWorkspaceAsNewOwner(page);
  await openInvites(page, workspaceName);
  await expect(page.getByText("No invites yet.")).toBeVisible();

  await createInviteViaUi(page, "Guest");
  const row = page.getByTestId("invite-row").first();
  await expect(row).toContainText("Guest invite");
  await expect(row).toContainText("Active");
  const link = await copyNewestLink(page);

  const visitor = await visitorPage(browser);
  try {
    await visitor.page.goto(link);
    await expect(
      visitor.page.getByRole("heading", { name: `Join ${workspaceName} as a guest` }),
    ).toBeVisible();

    await row.getByRole("button", { name: "Revoke" }).click();
    await expect(row).toContainText("Revoked");
    await expect(row.getByRole("button", { name: "Copy link" })).toHaveCount(0);

    await visitor.page.reload();
    await expect(visitor.page.getByText(INVALID_INVITE_TEXT)).toBeVisible();
  } finally {
    await visitor.context.close();
  }
});

test("a member invite asks the visitor to sign in and then joins them as a member", async ({
  page,
  browser,
}) => {
  const workspaceName = await createWorkspaceAsNewOwner(page);
  await openInvites(page, workspaceName);
  await createInviteViaUi(page, "Member");
  await expect(page.getByTestId("invite-row").first()).toContainText("Member invite");
  const link = await copyNewestLink(page);
  const token = link.slice(link.lastIndexOf("/") + 1);

  const visitor = await visitorPage(browser);
  try {
    await visitor.page.goto(link);
    await expect(visitor.page.getByRole("link", { name: "Sign in to join" })).toBeVisible();
    await expect(visitor.page.getByLabel("Your name")).toHaveCount(0);

    await visitor.page.getByRole("link", { name: "Sign in to join" }).click();
    await expect(visitor.page).toHaveURL(
      `${WEB_ORIGIN}/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`,
    );
    const email = newEmail();
    const code = await requestWebCode(visitor.page, email);
    await visitor.page.getByLabel("6-digit code").fill(code);
    await visitor.page.getByRole("button", { name: "Verify code" }).click();

    await expect(visitor.page).toHaveURL(`${WEB_ORIGIN}/invite/${token}`);
    await visitor.page.getByRole("button", { name: `Join ${workspaceName} as member` }).click();
    await expect(visitor.page).toHaveURL(`${WEB_ORIGIN}/app`);
    await expect(
      visitor.page.getByRole("listitem").filter({ hasText: workspaceName }),
    ).toContainText("Member");
    await expect(
      visitor.page.getByRole("listitem").filter({ hasText: workspaceName }).getByRole("link", {
        name: "Invites",
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    await visitor.context.close();
  }
});

test("an expired invite shows the invalid message", async ({ page }) => {
  const owner = await signInSeededUser(OWNER);
  const identity = await owner.auth.getUser();
  const ownerId = identity.data.user?.id;
  if (ownerId === undefined) {
    throw new Error("The seeded owner has no id");
  }
  const { data, error } = await owner
    .from("invites")
    .insert({
      workspace_id: SEEDED_WORKSPACE_ID,
      role: "guest",
      expires_at: new Date(Date.now() + 2000).toISOString(),
      created_by: ownerId,
    })
    .select("id, token")
    .single();
  expect(error).toBeNull();
  const invite = data;
  if (invite === null) {
    throw new Error("The invite was not created");
  }
  cleanup.push(async () => {
    await owner.from("invites").delete().eq("id", invite.id);
  });

  await expect(async () => {
    await page.goto(inviteUrl(invite.token));
    await expect(page.getByText(INVALID_INVITE_TEXT)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
});

test("an unknown or malformed token shows the invalid message", async ({ page }) => {
  await page.goto(inviteUrl("0".repeat(48)));
  await expect(page.getByText(INVALID_INVITE_TEXT)).toBeVisible();

  await page.goto(`${WEB_ORIGIN}/invite/not%20a%20token`);
  await expect(page.getByText(INVALID_INVITE_TEXT)).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveCount(0);
});

test("a guest joins on the web without the extension, keeps the web session and cannot manage invites", async ({
  page,
}) => {
  const owner = await signInSeededUser(OWNER);
  const token = await createInviteToken(owner, SEEDED_WORKSPACE_ID, "guest");
  cleanup.push(async () => {
    await revokeInviteToken(owner, token);
    await removeGuestsNamed(owner, GUEST_NAME);
  });

  await page.goto(inviteUrl(token));
  await expect(
    page.getByRole("heading", { name: `Join ${SEEDED_WORKSPACE_NAME} as a guest` }),
  ).toBeVisible();

  await page.getByLabel("Your name").fill("   ");
  await page.getByRole("button", { name: "Join as guest" }).click();
  await expect(page.locator("#guest-join-error")).toContainText("1 to 80");

  await page.getByLabel("Your name").fill(GUEST_NAME);
  await page.getByRole("button", { name: "Join as guest" }).click();

  await expect(
    page.getByRole("heading", { name: `You joined ${SEEDED_WORKSPACE_NAME}` }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Install the Sitenote extension" })).toBeVisible();
  await expect(page.getByRole("link", { name: `Open ${FIXTURE_ORIGIN}` })).toHaveAttribute(
    "href",
    FIXTURE_ORIGIN,
  );
  await expect(page.getByTestId("extension-connected")).toHaveCount(0);

  await page.getByRole("button", { name: "I installed it — connect" }).click();
  await expect(page.getByRole("button", { name: "I installed it — connect" })).toBeVisible();

  await page.goto(`${WEB_ORIGIN}/app`);
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app`);
  const row = page.getByRole("listitem").filter({ hasText: SEEDED_WORKSPACE_NAME });
  await expect(row).toContainText("Guest");
  await expect(row.getByRole("link", { name: "Invites", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("display-name")).toHaveText(GUEST_NAME);

  const response = await page.goto(`${WEB_ORIGIN}/app/w/${SEEDED_WORKSPACE_ID}/invites`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Create invite link")).toHaveCount(0);
});

test("a member cannot open the invites page of the workspace either", async ({ page }) => {
  await signInOnWeb(page, "member@sitenote.test");
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app`);

  const response = await page.goto(`${WEB_ORIGIN}/app/w/${SEEDED_WORKSPACE_ID}/invites`);

  expect(response?.status()).toBe(404);
});

test("the invites page asks a visitor to sign in first", async ({ page }) => {
  await page.goto(`${WEB_ORIGIN}/app/w/${SEEDED_WORKSPACE_ID}/invites`);

  await expect(page).toHaveURL(
    `${WEB_ORIGIN}/sign-in?next=${encodeURIComponent(`/app/w/${SEEDED_WORKSPACE_ID}/invites`)}`,
  );
});

test("the forget-session endpoint refuses requests from another origin", async ({ page }) => {
  const foreign = await page.request.post(`${WEB_ORIGIN}/auth/forget-session`, {
    headers: { origin: "http://evil.example" },
  });
  const missing = await page.request.post(`${WEB_ORIGIN}/auth/forget-session`);
  const own = await page.request.post(`${WEB_ORIGIN}/auth/forget-session`, {
    headers: { origin: WEB_ORIGIN },
  });

  expect(foreign.status()).toBe(403);
  expect(missing.status()).toBe(403);
  expect(own.status()).toBe(204);
});
