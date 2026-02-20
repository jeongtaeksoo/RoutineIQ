import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

async function runAccountDeleteFlow(page: import("@playwright/test").Page) {
  await installRoutineApiMock(page);

  let deleteCalled = false;
  await page.route("**/api/preferences/account", async (route) => {
    deleteCalled = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/app/settings/account");
  await expect(page).toHaveURL(/\/app\/settings\/account/);

  await page.getByPlaceholder("DELETE").fill("DELETE");
  await page
    .getByRole("button", {
      name: /delete account|회원탈퇴|アカウント削除|删除账号/i,
    })
    .click();

  await expect.poll(() => deleteCalled).toBe(true);
  await expect(page).toHaveURL(/\/login\?deleted=1/);
}

test.describe("account deletion flow", () => {
  test.describe("desktop", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("deletes account and redirects to login", async ({ page }) => {
      await runAccountDeleteFlow(page);
    });
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("deletes account and redirects to login", async ({ page }) => {
      await runAccountDeleteFlow(page);
    });
  });
});
