import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("onboarding shows swipe guide cards for first activation", async ({ page }) => {
  await installRoutineApiMock(page);

  await page.route("**/api/me/activation", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile_complete: false,
        has_any_log: false,
        has_any_report: false,
        activation_complete: false,
        next_step: "profile",
      }),
    });
  });

  await page.goto("/app/onboarding");
  await expect(page).toHaveURL(/\/app\/onboarding/);

  await expect(page.getByRole("heading", { name: /첫 사용 가이드|First-Use Guide/i })).toBeVisible();
  await expect(page.getByText(/서비스 사용법 카드|How to Use Cards/i)).toBeVisible();
  await expect(page.getByText(/오늘을 짧게 기록하세요|Log your day quickly/i)).toBeVisible();

  await page.getByRole("button", { name: /다음|Next/i }).click();
  await expect(page.getByText(/AI 정리 결과를 확인하세요|Check AI-structured blocks/i)).toBeVisible();
});

test("incomplete activation remaps locked nav links to onboarding", async ({ page }) => {
  await installRoutineApiMock(page);

  await page.route("**/api/me/activation", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile_complete: true,
        has_any_log: false,
        has_any_report: false,
        activation_complete: false,
        next_step: "log",
      }),
    });
  });

  await page.goto("/app/onboarding");
  await expect(page).toHaveURL(/\/app\/onboarding/);

  const lockedNavLinks = page.locator('a[data-onboarding-locked="true"]');
  await expect(lockedNavLinks.first()).toHaveAttribute("href", "/app/onboarding");
  await lockedNavLinks.first().click();
  await expect(page).toHaveURL(/\/app\/onboarding/);
});

test("incomplete activation can still open tomorrow plan without redirecting to today", async ({
  page,
}) => {
  await installRoutineApiMock(page);

  await page.route("**/api/me/activation", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile_complete: true,
        has_any_log: false,
        has_any_report: false,
        activation_complete: false,
        next_step: "log",
      }),
    });
  });

  await page.goto("/app/onboarding");
  await expect(page).toHaveURL(/\/app\/onboarding/);

  const planLink = page.getByRole("link", { name: /내일 계획|Tomorrow Plan/i }).first();
  await expect(planLink).toHaveAttribute("href", "/app/plan");
  await planLink.click();
  await expect(page).toHaveURL(/\/app\/plan/);
  await expect(page.getByRole("heading", { name: /내일 계획|Tomorrow Plan/i })).toBeVisible();
});
