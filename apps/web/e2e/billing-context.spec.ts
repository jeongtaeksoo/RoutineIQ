import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("billing entry context banner is shown for report_limit source and links back", async ({ page }) => {
  await installRoutineApiMock(page);

  await page.goto("/app/billing?from=report_limit");
  await expect(page).toHaveURL(/\/app\/billing\?from=report_limit/);

  const context = page.getByTestId("billing-entry-context");
  await expect(context).toBeVisible();
  await expect(context).toContainText(/분석 한도|analyze limit/i);

  const backLink = context.getByRole("link", { name: /리포트로 돌아가기|Back to reports/i });
  await expect(backLink).toHaveAttribute("href", "/app/reports");

  await backLink.click();
  await expect(page).toHaveURL(/\/app\/reports\/\d{4}-\d{2}-\d{2}/);
});
