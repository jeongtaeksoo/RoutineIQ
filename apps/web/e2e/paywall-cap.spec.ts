import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("value CTA exposure is capped per slot to reduce fatigue", async ({ page }) => {
  await installRoutineApiMock(page);

  const cta = page.getByRole("link", { name: /PRO 가치 보기|Unlock Pro Value/i });

  await page.goto("/app/plan?visit=1");
  await expect(cta).toBeVisible();

  await page.goto("/app/plan?visit=2");
  await expect(cta).toBeVisible();

  await page.goto("/app/plan?visit=3");
  await expect(cta).toHaveCount(0);
});
