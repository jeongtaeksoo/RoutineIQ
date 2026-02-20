import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("insights trust badge shows remediation actions when data is sparse", async ({ page }) => {
  await installRoutineApiMock(page);

  await page.goto("/app/today");
  await expect(page).toHaveURL(/\/app\/insights|\/app\/today/);

  await expect(page.getByText(/AI 참고 안내|AI Notice/i)).toBeVisible();
  await expect(page.getByText(/최근 7일 기록일?|Logged days \(7d\)/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /프로필 완성|Complete profile/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /오늘 기록하기|Log today/i })).toBeVisible();
});

test("reports trust badge renders analysis quality metrics after analyze", async ({ page }) => {
  await installRoutineApiMock(page);

  await page.goto("/app/reports/2026-02-13");
  await expect(page).toHaveURL(/\/app\/reports\/2026-02-13/);

  await page.getByRole("button", { name: /이 날의 기록 정리하기|Analyze this day/i }).click();

  await expect(page.getByText(/AI 참고 안내|AI Notice/i)).toBeVisible();
  await expect(page.getByText(/기록 완성도|입력 품질|Input quality/i)).toBeVisible();
  await expect(page.getByText(/분석 안정성|모델 재시도|Analysis stability|Model retries/i)).toBeVisible();
});
