import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

const previewViewports = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

for (const vp of previewViewports) {
  test(`cohort preview card shows preview/confidence badges and hides rank-tip on ${vp.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await installRoutineApiMock(page);

    await page.route("**/api/trends/cohort**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          enabled: true,
          insufficient_sample: false,
          min_sample_size: 50,
          preview_sample_size: 20,
          high_confidence_sample_size: 100,
          threshold_variant: "control",
          preview_mode: true,
          confidence_level: "low",
          cohort_size: 30,
          active_users: 30,
          window_days: 14,
          compare_by: ["age_group", "job_family"],
          filters: { age_group: "25_34", job_family: "office_worker" },
          metrics: {
            focus_window_rate: 64,
            rebound_rate: 42,
            recovery_buffer_day_rate: 28,
            focus_window_numerator: 32,
            focus_window_denominator: 50,
            rebound_numerator: 21,
            rebound_denominator: 50,
            recovery_day_numerator: 14,
            recovery_day_denominator: 50,
          },
          message: "참고용 미리보기입니다 (30/50). 표본이 더 쌓이면 정식 비교를 제공합니다.",
          my_focus_rate: 60,
          my_rebound_rate: 39,
          my_recovery_rate: 22,
          my_focus_delta_7d: 4,
          my_rebound_delta_7d: -2,
          my_recovery_delta_7d: 0,
          rank_label: "",
          actionable_tip: "",
        }),
      });
    });

    await page.goto("/app/insights");
    await expect(page).toHaveURL(/\/app\/insights/);

    await expect(page.locator("span", { hasText: /참고용 미리보기|Preview only/i })).toBeVisible();
    await expect(page.getByText(/데이터 (신뢰도|정확도):\s*낮음|Data confidence:\s*Low/i)).toBeVisible();
    await expect(page.locator("p", { hasText: /비교 기준:|Compared by:/i }).first()).toBeVisible();
    await expect(page.locator("p", { hasText: /전주 대비|vs last week/i }).first()).toBeVisible();
    await expect(page.getByText(/14일 기준|14-day window/i)).toBeVisible();

    await expect(page.getByText(/나의 위치|Your rank/i)).toHaveCount(0);
    await expect(page.getByText(/실행 팁|Actionable tip/i)).toHaveCount(0);
  });
}
