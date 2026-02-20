import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("quick settings modal closes after navigating through modal links", async ({ page }) => {
  await installRoutineApiMock(page);

  await page.goto("/app/billing");
  await page.getByRole("button", { name: /설정|Settings/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await page.getByRole("tab", { name: /데이터 제어|Data control/i }).click();
  await page.getByRole("link", { name: /데이터 전체 초기화|Reset all data/i }).click();

  await expect(page).toHaveURL(/\/app\/settings\/privacy/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
