import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("account tab avoids '-' placeholders and shows email setup CTA when needed", async ({ page }) => {
  await installRoutineApiMock(page);

  await page.route("**/api/me/entitlements", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plan: "free",
        is_pro: false,
        status: null,
        current_period_end: null,
        cancel_at_period_end: null,
        needs_email_setup: true,
        can_use_checkout: false,
        analyze_used_today: 0,
        analyze_remaining_today: 1,
        limits: {
          daily_analyze_limit: 1,
          report_retention_days: 3,
        },
      }),
    });
  });

  await page.goto("/app/billing");
  await page.getByRole("button", { name: /설정|Settings/i }).click();
  await page.getByRole("tab", { name: /계정|Account/i }).click();

  await expect(page.getByTestId("settings-account-name-value")).not.toHaveText("-");
  await expect(page.getByTestId("settings-account-email-value")).not.toHaveText("-");
  await expect(
    page.getByText(/이메일 로그인으로 전환하면|Convert to email login/i),
  ).toBeVisible();

  const setupLink = page.getByRole("link", {
    name: /이메일 계정 설정하기|Set up email account/i,
  });
  await expect(setupLink).toHaveAttribute("href", /\/app\/billing\?from=settings/);
});
