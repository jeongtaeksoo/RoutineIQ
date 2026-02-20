import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("report analyze can be canceled without navigation", async ({ page }) => {
  await installRoutineApiMock(page);

  await page.route("**/api/analyze", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        date: "2026-02-13",
        report: {
          schema_version: 2,
          summary: "Delayed report",
          productivity_peaks: [],
          failure_patterns: [],
          tomorrow_routine: [],
          if_then_rules: [],
          coach_one_liner: "Delayed",
          yesterday_plan_vs_actual: { comparison_note: "", top_deviation: "" },
        },
      }),
    });
  });

  await page.goto("/app/reports/2026-02-13");
  await expect(page.getByRole("heading", { name: /나의 하루 리포트|AI Coach Report/i })).toBeVisible();

  await page.getByRole("button", { name: /리포트 만들기|Start analyze/i }).click();
  const cancelButton = page.getByRole("button", { name: /정리 취소|Cancel analyze/i }).first();
  await expect(cancelButton).toBeVisible();
  await cancelButton.click();

  await expect(
    page.getByText(/리포트 생성을 취소했습니다|Report generation was canceled/i),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/app\/reports\/2026-02-13/);
});
