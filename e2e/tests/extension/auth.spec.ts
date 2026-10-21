import type { Page } from "@playwright/test";

import { expect, STABLE_EXTENSION_ID, test } from "../../fixtures/extension";
import {
  evaluateIn,
  isRecord,
  newEmail,
  openPopup,
  requestCode,
  signIn,
  stopServiceWorker,
} from "../../support/extension";

const SEEDED_MEMBER = "member@sitenote.test";
const ALARM_NAME = "sitenote-auth-refresh";
const ALARM_MARGIN_MS = 60_000;
const STORAGE_PREFIX = "sitenote.auth.";

async function readStoredSession(page: Page): Promise<Record<string, unknown>> {
  const raw = await evaluateIn(
    page,
    `chrome.storage.local.get(null).then((all) => {
      const key = Object.keys(all).find((k) => k.startsWith("${STORAGE_PREFIX}") && k.endsWith("-auth-token"));
      return key === undefined ? null : all[key];
    })`,
  );
  if (typeof raw !== "string") {
    throw new Error("No stored session found");
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error("The stored session is not an object");
  }
  return parsed;
}

async function storedAuthKeys(page: Page): Promise<string[]> {
  const keys = await evaluateIn(
    page,
    `chrome.storage.local.get(null).then((all) => Object.keys(all).filter((k) => k.startsWith("${STORAGE_PREFIX}")))`,
  );
  return Array.isArray(keys) ? keys.map(String) : [];
}

async function readAlarmTime(page: Page): Promise<number | null> {
  const alarm = await evaluateIn(page, `chrome.alarms.get("${ALARM_NAME}")`);
  return isRecord(alarm) && typeof alarm.scheduledTime === "number" ? alarm.scheduledTime : null;
}

test("the extension id is the stable id from the manifest key", ({ extensionId }) => {
  expect(extensionId).toBe(STABLE_EXTENSION_ID);
});

test("the e2e build asks for the documented permissions and only the fixture and example.com host access", async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);

  const manifest = await evaluateIn(popup, "chrome.runtime.getManifest()");

  expect(isRecord(manifest)).toBe(true);
  if (!isRecord(manifest)) {
    return;
  }
  expect(manifest.permissions).toEqual(["storage", "identity", "alarms", "scripting", "activeTab"]);
  expect(manifest.optional_host_permissions).toEqual(["http://*/*", "https://*/*"]);
  expect(manifest.host_permissions).toEqual([
    "http://127.0.0.1/*",
    "http://localhost/*",
    "https://example.com/*",
  ]);
  expect(manifest.content_scripts).toBeUndefined();
  expect(manifest.commands).toMatchObject({
    "toggle-comment-mode": { suggested_key: { default: "Alt+Shift+C" } },
  });
});

test("a signed-out popup offers the email form and no Google button", async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);

  await expect(popup.getByLabel("Email")).toBeVisible();
  await expect(popup.getByRole("button", { name: "Email me a code" })).toBeVisible();
  await expect(popup.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
});

test("the seeded member signs in with an email code and the popup shows Max Member", async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);

  await signIn(popup, SEEDED_MEMBER);

  await expect(popup.getByTestId("display-name")).toHaveText("Max Member");
  await expect(popup.getByTestId("account-email")).toHaveText(SEEDED_MEMBER);
  await expect(popup.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(popup.getByLabel("Email")).toHaveCount(0);
});

test("the session survives a popup reload and a new popup", async ({ context, extensionId }) => {
  const popup = await openPopup(context, extensionId);
  await signIn(popup, newEmail());
  const name = (await popup.getByTestId("display-name").textContent()) ?? "";

  await popup.reload();
  await expect(popup.getByTestId("display-name")).toHaveText(name);

  await popup.close();
  const reopened = await openPopup(context, extensionId);
  await expect(reopened.getByTestId("display-name")).toHaveText(name);
});

test("the session survives a stopped service worker", async ({ context, extensionId }) => {
  const popup = await openPopup(context, extensionId);
  const email = newEmail();
  await signIn(popup, email);

  await stopServiceWorker(context, popup);
  await popup.reload();

  await expect(popup.getByTestId("account-email")).toHaveText(email);
});

test("an expired access token is refreshed when the service worker wakes up", async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);
  const email = newEmail();
  await signIn(popup, email);
  const before = await readStoredSession(popup);
  const nowSeconds = Math.floor(Date.now() / 1000);
  await evaluateIn(
    popup,
    `chrome.storage.local.get(null).then((all) => {
      const key = Object.keys(all).find((k) => k.startsWith("${STORAGE_PREFIX}") && k.endsWith("-auth-token"));
      const session = JSON.parse(all[key]);
      session.expires_at = ${String(nowSeconds - 30)};
      return chrome.storage.local.set({ [key]: JSON.stringify(session) });
    })`,
  );

  await stopServiceWorker(context, popup);
  await popup.reload();

  await expect(popup.getByTestId("account-email")).toHaveText(email);
  const after = await readStoredSession(popup);
  expect(after.access_token).not.toBe(before.access_token);
  expect(Number(after.expires_at)).toBeGreaterThan(nowSeconds + 600);
});

test("a refresh alarm is scheduled shortly before the access token expires", async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);
  await expect.poll(() => readAlarmTime(popup)).toBeNull();

  await signIn(popup, newEmail());

  const session = await readStoredSession(popup);
  const expectedTime = Number(session.expires_at) * 1000 - ALARM_MARGIN_MS;
  await expect
    .poll(async () => Math.abs(((await readAlarmTime(popup)) ?? 0) - expectedTime))
    .toBeLessThan(2000);

  await popup.getByRole("button", { name: "Sign out" }).click();
  await expect(popup.getByLabel("Email")).toBeVisible();
  await expect.poll(() => readAlarmTime(popup)).toBeNull();
});

test("signing out returns to the form and removes the stored session", async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);
  await signIn(popup, newEmail());
  expect((await storedAuthKeys(popup)).length).toBeGreaterThan(0);

  await popup.getByRole("button", { name: "Sign out" }).click();

  await expect(popup.getByLabel("Email")).toBeVisible();
  await expect(popup.getByTestId("display-name")).toHaveCount(0);
  await expect.poll(() => storedAuthKeys(popup)).toEqual([]);

  await popup.reload();
  await expect(popup.getByLabel("Email")).toBeVisible();
});

test("a wrong code shows an error and the right code still works", async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);
  const email = newEmail();
  const code = await requestCode(popup, email);
  const wrong = code === "000000" ? "111111" : "000000";

  await popup.getByLabel("6-digit code").fill(wrong);
  await popup.getByRole("button", { name: "Verify code" }).click();

  await expect(popup.getByRole("alert")).toContainText("wrong or has expired");
  await expect(popup.getByLabel("6-digit code")).toHaveValue("");

  await popup.getByLabel("6-digit code").fill(code);
  await popup.getByRole("button", { name: "Verify code" }).click();
  await expect(popup.getByTestId("account-email")).toHaveText(email);
});

test("closing the popup while waiting for the e-mail keeps the code step", async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);
  const email = newEmail();
  const code = await requestCode(popup, email);

  await popup.close();
  const reopened = await openPopup(context, extensionId);

  await expect(reopened.getByRole("status")).toContainText(email);
  await reopened.getByLabel("6-digit code").fill(code);
  await reopened.getByRole("button", { name: "Verify code" }).click();
  await expect(reopened.getByTestId("account-email")).toHaveText(email);

  await reopened.getByRole("button", { name: "Sign out" }).click();
  await expect(reopened.getByLabel("Email")).toBeVisible();
});

test("an open popup follows sign-in and sign-out done in another popup", async ({
  context,
  extensionId,
}) => {
  const first = await openPopup(context, extensionId);
  const second = await openPopup(context, extensionId);
  const email = newEmail();

  await signIn(first, email);
  await expect(second.getByTestId("account-email")).toHaveText(email);

  await first.getByRole("button", { name: "Sign out" }).click();
  await expect(second.getByLabel("Email")).toBeVisible();
});

test("the background rejects malformed requests with a typed error", async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);

  const unknownType = await evaluateIn(
    popup,
    `chrome.runtime.sendMessage({ type: "auth.deleteEverything" })`,
  );
  const badEmail = await evaluateIn(
    popup,
    `chrome.runtime.sendMessage({ type: "auth.sendCode", email: "not-an-email" })`,
  );

  expect(unknownType).toMatchObject({ ok: false, error: { code: "invalid_request" } });
  expect(badEmail).toMatchObject({ ok: false, error: { code: "invalid_request" } });
});

test("Google sign-in is refused by the background while the flag is off", async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);

  const response = await evaluateIn(
    popup,
    `chrome.runtime.sendMessage({ type: "auth.signInWithGoogle" })`,
  );

  expect(response).toMatchObject({ ok: false, error: { code: "google_disabled" } });
});
