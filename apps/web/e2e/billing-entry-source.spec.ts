import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("plan and settings entry links include billing source parameter", async ({ page }) => {
  await installRoutineApiMock(page);

  await page.goto("/app/plan");
  await expect(page).toHaveURL(/\/app\/plan/);

  const planCta = page.getByRole("link", { name: /요금제 비교 보기|Compare plans/i });
  await expect(planCta).toHaveAttribute("href", "/app/billing?from=plan");

  await page.goto("/app/billing");
  await page.getByRole("button", { name: /설정|Settings/i }).click();
  await page.getByRole("tab", { name: /계정|Account/i }).click();
  await expect(page.locator('a[href="/app/billing?from=settings"]').first()).toBeVisible();
});
