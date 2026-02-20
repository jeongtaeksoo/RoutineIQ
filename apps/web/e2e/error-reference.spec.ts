import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("report analyze error shows reference id for support", async ({ page }) => {
  await installRoutineApiMock(page);
  await page.route("**/api/analyze", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        detail: {
          message: "Analyze pipeline failed",
          code: "ANALYZE_PIPELINE_ERROR",
        },
      }),
    });
  });

  await page.goto("/app/reports/2026-02-13");
  await expect(page).toHaveURL(/\/app\/reports\/2026-02-13/);

  await page.getByRole("button", { name: /이 날의 기록 정리하기|Analyze this day/i }).click();
  await expect(page.getByText(/오류 참조 ID|Error reference/i)).toBeVisible();
});

test("daily-flow parse error shows reference id for support", async ({ page }) => {
  await installRoutineApiMock(page);
  await page.route("**/api/parse-diary", async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        detail: {
          code: "PARSE_UPSTREAM_HTTP_ERROR",
          message: "Upstream parser unavailable",
        },
      }),
    });
  });

  await page.goto("/app/daily-flow");
  await page.locator("textarea").fill("오전에는 집중해서 개발했고 오후에는 회의와 정리를 반복했습니다.");
  await page.getByRole("button", { name: /AI 분석하기|Parse with AI/i }).first().click();

  await expect(page.getByText(/오류 참조 ID|Error reference/i)).toBeVisible();
});

test("report analyze in-progress recovers without showing error reference", async ({
  page,
}) => {
  await installRoutineApiMock(page);

  let reportsGetCount = 0;
  await page.route("**/api/reports?date=2026-02-13", async (route) => {
    reportsGetCount += 1;
    if (reportsGetCount <= 1) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: { message: "Report not found" } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        date: "2026-02-13",
        report: {
          schema_version: 2,
          summary: "Recovered from in-progress state.",
          productivity_peaks: [],
          failure_patterns: [],
          tomorrow_routine: [],
          if_then_rules: [],
          coach_one_liner: "Recovered",
          yesterday_plan_vs_actual: { comparison_note: "", top_deviation: "" },
        },
      }),
    });
  });

  await page.route("**/api/analyze", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        detail: {
          message: "Analyze request is already processing.",
          hint: "Retry in a few seconds.",
          code: "ANALYZE_IN_PROGRESS",
        },
      }),
    });
  });

  await page.goto("/app/reports/2026-02-13");
  await expect(page).toHaveURL(/\/app\/reports\/2026-02-13/);

  await page.getByRole("button", { name: /이 날의 기록 정리하기|Analyze this day/i }).click();
  await expect(
    page.getByText(/결과를 확인 중입니다|Checking for the report in the background/i),
  ).toBeVisible();
  await expect(page.getByText(/오류 참조 ID|Error reference/i)).toHaveCount(0);
});
