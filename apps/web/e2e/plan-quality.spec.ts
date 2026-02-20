import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

test("plan page shows execution canvas and readiness cards when report exists", async ({ page }) => {
  await installRoutineApiMock(page);

  const date = todayLocal();
  await page.goto("/app/today");
  await page.evaluate(async (targetDate: string) => {
    await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: targetDate, force: true }),
    });
  }, date);

  await page.goto("/app/plan");
  await expect(page).toHaveURL(/\/app\/plan/);

  await expect(page.getByText(/내일 실행 캔버스|Tomorrow Execution Canvas/i)).toBeVisible();
  await expect(page.getByText(/실행 준비도$|Execution Readiness$/i)).toBeVisible();
  await expect(page.getByText(/리스크 대비 \+ 복귀 규칙|Risk Guard \+ Recovery Rule/i)).toBeVisible();
  await expect(page.getByText(/첫 시작 블록|First block/i)).toBeVisible();
});
