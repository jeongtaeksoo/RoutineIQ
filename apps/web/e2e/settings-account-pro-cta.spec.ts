import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("account tab shows manage billing CTA when user is already pro", async ({ page }) => {
  await installRoutineApiMock(page);

  await page.route("**/api/me/entitlements", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plan: "pro",
        is_pro: true,
        status: "active",
        current_period_end: null,
        cancel_at_period_end: false,
        needs_email_setup: false,
        can_use_checkout: true,
        analyze_used_today: 0,
        analyze_remaining_today: 99,
        limits: {
          daily_analyze_limit: 99,
          report_retention_days: 180,
        },
      }),
    });
  });

  await page.goto("/app/billing");
  await page.getByRole("button", { name: /설정|Settings/i }).click();
  await page.getByRole("tab", { name: /계정|Account/i }).click();

  const manageBillingLink = page.getByRole("link", {
    name: /결제 관리|Manage billing/i,
  });
  await expect(manageBillingLink).toBeVisible();
  await expect(manageBillingLink).toHaveAttribute("href", /\/app\/billing\?from=settings/);
});
