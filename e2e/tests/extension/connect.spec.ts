import { expect, test } from "../../fixtures/extension";
import { newEmail, openPopup } from "../../support/extension";
import { WEB_ORIGIN, signInOnWeb, webAuthCookies } from "../../support/web-auth";

test("a member signs in on the web, connects the extension and the web app signs out", async ({
  context,
  extensionId,
}) => {
  const email = newEmail();
  const page = await context.newPage();

  await signInOnWeb(page, email);
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app`);

  await page.goto(`${WEB_ORIGIN}/extension/connect`);
  await expect(page.getByRole("heading", { name: "Connect the extension" })).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Connect the extension" }).click();

  await expect(page.getByTestId("extension-connected")).toBeVisible();
  await expect.poll(() => webAuthCookies(context)).toEqual([]);

  const popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId("account-email")).toHaveText(email);

  await page.goto(`${WEB_ORIGIN}/app`);
  await expect(page).toHaveURL(/\/sign-in\?next=/);
});

test("the popup sends a signed-out user to the connect page on the website", async ({
  context,
  extensionId,
}) => {
  const popup = await openPopup(context, extensionId);
  const [connect] = await Promise.all([
    context.waitForEvent("page"),
    popup.getByRole("button", { name: "Sign in on the website" }).click(),
  ]);

  await expect(connect).toHaveURL(`${WEB_ORIGIN}/sign-in?next=/extension/connect`);
  await expect(connect.getByLabel("Email")).toBeVisible();
});
