import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("profile setup warning can be dismissed for the current day", async ({ page }) => {
  await installRoutineApiMock(page);

  await page.goto("/app/insights");
  await expect(page).toHaveURL(/\/app\/insights|\/app\/today/);

  const warningTitle = page.getByText(/프로필을 완성하면 추천이 더 정확해져요|Complete your profile to improve personalization/i);
  const dismissButton = page.getByRole("button", { name: /오늘 숨기기|Hide for today/i });

  await expect(warningTitle).toBeVisible();
  await dismissButton.click();
  await expect(warningTitle).toHaveCount(0);

  await page.reload();
  await expect(warningTitle).toHaveCount(0);
});
