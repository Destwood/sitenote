import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { requestSignInLink } from "../../support/web-auth";
import { anonymousSessionCookies } from "../../support/supabase-session";

const SEEDED_OWNER = "owner@sitenote.test";
const SEEDED_MEMBER = "member@sitenote.test";
const WORKSPACE_NAME = "Northwind Studio";

function newEmail(): string {
  return `e2e-${randomUUID()}@sitenote.test`;
}

async function signInWithLink(page: Page, email: string, path = "/sign-in"): Promise<void> {
  await page.goto(path);
  await page.goto(await requestSignInLink(page, email));
}

function searchParam(page: Page, name: string): string | null {
  return new URL(page.url()).searchParams.get(name);
}

test("a new user signs in with an email link, creates a workspace and signs out", async ({
  page,
}) => {
  const email = newEmail();

  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/sign-in");

  const link = await requestSignInLink(page, email);
  await expect(page.getByRole("status")).toContainText(email);
  await page.goto(link);

  await expect(page).toHaveURL("/app");
  await expect(page.getByRole("heading", { name: "Your workspaces" })).toBeVisible();
  await expect(page.getByText("You are not in any workspace yet.")).toBeVisible();
  await expect(page.getByTestId("display-name")).toHaveText(email.split("@")[0] ?? "");

  await page.getByLabel("Workspace name").fill("  Acme Studio  ");
  await page.getByRole("button", { name: "Create workspace" }).click();

  const row = page.getByRole("listitem").filter({ hasText: "Acme Studio" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Owner");
  await expect(page.getByText("You are not in any workspace yet.")).toHaveCount(0);
  await expect(page.getByLabel("Workspace name")).toHaveValue("");

  await page.reload();
  await expect(page).toHaveURL("/app");
  await expect(page.getByRole("listitem").filter({ hasText: "Acme Studio" })).toContainText(
    "Owner",
  );

  await page.goto("/sign-in");
  await expect(page).toHaveURL("/app");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  expect(searchParam(page, "next")).toBe("/app");
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("the workspace form rejects a blank name and keeps the user on the page", async ({ page }) => {
  await signInWithLink(page, newEmail());
  await expect(page).toHaveURL("/app");

  await page.getByLabel("Workspace name").fill("   ");
  await page.getByRole("button", { name: "Create workspace" }).click();

  await expect(page.locator("#workspace-error")).toContainText("1 to 80");
  await expect(page.getByText("You are not in any workspace yet.")).toBeVisible();
});

test("the seeded owner signs in by link and sees Northwind Studio", async ({ page }) => {
  await signInWithLink(page, SEEDED_OWNER);

  await expect(page).toHaveURL("/app");
  await expect(page.getByTestId("display-name")).toHaveText("Olena Owner");
  const row = page.getByRole("listitem").filter({ hasText: WORKSPACE_NAME });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Owner");
});

test("a seeded member sees the workspace with the member role", async ({ page }) => {
  await signInWithLink(page, SEEDED_MEMBER);

  await expect(page).toHaveURL("/app");
  const row = page.getByRole("listitem").filter({ hasText: WORKSPACE_NAME });
  await expect(row).toContainText("Member");
});

test("the sign-in page updates when the link is opened in another tab", async ({
  page,
  context,
}) => {
  const email = newEmail();
  await page.goto("/sign-in");
  const link = await requestSignInLink(page, email);
  await expect(page.getByLabel(/code/i)).toHaveCount(0);

  const other = await context.newPage();
  await other.goto(link);
  await expect(other).toHaveURL("/app");

  await expect(page.getByTestId("signed-in")).toContainText(email);
  await page.getByRole("link", { name: "Open dashboard" }).click();
  await expect(page).toHaveURL("/app");
  await expect(page.getByRole("heading", { name: "Your workspaces" })).toBeVisible();
});

test("resend is locked right after a link was sent", async ({ page }) => {
  await page.goto("/sign-in");
  await requestSignInLink(page, newEmail());

  await expect(page.getByRole("button", { name: /^Resend link in \d+s$/ })).toBeDisabled();
});

test("a raw protocol-relative next parameter is ignored after sign-in", async ({
  page,
  baseURL,
}) => {
  await signInWithLink(page, newEmail(), "/sign-in?next=//evil.example");

  await expect(page).toHaveURL("/app");
  expect(new URL(page.url()).origin).toBe(baseURL);
});

const UNSAFE_NEXT_VALUES = [
  "//evil.example",
  "/\\evil.example",
  "https://evil.example/app",
  "%2F%2Fevil.example",
  "javascript:alert(1)",
];

for (const unsafe of UNSAFE_NEXT_VALUES) {
  test(`the next parameter ${unsafe} is ignored after sign-in`, async ({ page, baseURL }) => {
    await signInWithLink(page, newEmail(), `/sign-in?next=${encodeURIComponent(unsafe)}`);

    await expect(page).toHaveURL("/app");
    expect(new URL(page.url()).origin).toBe(baseURL);
  });
}

test("a safe next parameter is honoured", async ({ page }) => {
  await signInWithLink(page, newEmail(), "/sign-in?next=/app%3Fvia%3Demail");

  await expect(page).toHaveURL("/app?via=email");
});

test("a failed auth callback returns to sign-in with a fixed message", async ({ page }) => {
  await page.goto("/auth/callback?code=not-a-real-code&next=/app");

  await expect(page).toHaveURL("/sign-in?error=exchange_failed");
  await expect(page.locator("#sign-in-error")).toContainText("invalid or has expired");
});

test("an auth callback without a code explains that the link is incomplete", async ({ page }) => {
  await page.goto("/auth/callback");

  await expect(page).toHaveURL("/sign-in?error=missing_code");
  await expect(page.locator("#sign-in-error")).toContainText("incomplete");
});

test("a provider error is mapped to a fixed message and never echoed", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied&error_description=%3Cb%3Ehacked%3C%2Fb%3E");

  await expect(page).toHaveURL("/sign-in?error=access_denied");
  await expect(page.locator("#sign-in-error")).toContainText("cancelled");
  await expect(page.getByText("hacked")).toHaveCount(0);
});

test("an unknown error key on the sign-in page is ignored", async ({ page }) => {
  await page.goto("/sign-in?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E");

  await expect(page.locator("#sign-in-error")).toHaveCount(0);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("the sign-out endpoint ignores GET requests", async ({ page }) => {
  const response = await page.request.get("/auth/sign-out");

  expect(response.status()).toBe(405);
});

test("a guest session sees a message instead of the create form", async ({ page, context }) => {
  await context.addCookies(await anonymousSessionCookies("localhost"));

  await page.goto("/app");

  await expect(page).toHaveURL("/app");
  await expect(page.getByText("Guests cannot create workspaces.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create workspace" })).toHaveCount(0);

  await page.goto("/sign-in");
  await expect(page).toHaveURL("/sign-in");
  await expect(page.getByLabel("Email")).toBeVisible();
});
