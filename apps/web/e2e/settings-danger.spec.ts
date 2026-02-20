import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

for (const vp of viewports) {
  test(`privacy/account danger actions require DELETE confirmation on ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await installRoutineApiMock(page);

    await page.goto("/app/settings/privacy");
    await expect(page).toHaveURL(/\/app\/settings\/privacy/);

    const privacyDeleteButton = page.getByRole("button", {
      name: /기록\/리포트 전체 삭제|Delete all logs\/reports/i,
    });
    await expect(privacyDeleteButton).toBeDisabled();

    await page.getByPlaceholder("DELETE").fill("DEL");
    await expect(privacyDeleteButton).toBeDisabled();

    await page.getByPlaceholder("DELETE").fill("DELETE");
    await expect(privacyDeleteButton).toBeEnabled();

    await page.goto("/app/settings/account");
    await expect(page).toHaveURL(/\/app\/settings\/account/);

    const accountDeleteButton = page.getByRole("button", {
      name: /delete account|회원탈퇴|アカウント削除|删除账号/i,
    });
    await expect(accountDeleteButton).toBeDisabled();

    await page.getByPlaceholder("DELETE").fill("delete");
    await expect(accountDeleteButton).toBeEnabled();

    await page.getByPlaceholder("DELETE").fill("nope");
    await expect(accountDeleteButton).toBeDisabled();
  });
}
