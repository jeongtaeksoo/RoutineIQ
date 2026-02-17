import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("insights shows recovery entry point when active recovery session exists", async ({ page }) => {
  await installRoutineApiMock(page);

  await page.route("**/api/recovery/active", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        has_open_session: true,
        session_id: "sess-e2e-1",
        lapse_start_ts: "2026-02-17T01:00:00Z",
        elapsed_min: 37,
        correlation_id: "e2e-recovery",
      }),
    });
  });

  await page.goto("/app/insights");
  await expect(page).toHaveURL(/\/app\/insights/);

  await expect(
    page.getByText(/Ready to pick back up\?|다시 시작해볼까요\?/i)
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Restart today's log|오늘 기록 다시 시작/i })).toBeVisible();
});

test("insights shows pending in-app recovery nudge and can acknowledge it", async ({ page }) => {
  await installRoutineApiMock(page);

  await page.route("**/api/recovery/nudge", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        has_nudge: true,
        nudge: {
          nudge_id: "nudge-e2e-1",
          session_id: "sess-e2e-2",
          message: "You don't need a perfect restart. Try one 2-minute action now.",
          lapse_start_ts: "2026-02-17T01:00:00Z",
          created_at: "2026-02-17T02:00:00Z",
          correlation_id: "e2e-nudge",
        },
        correlation_id: "e2e-nudge",
      }),
    });
  });

  await page.goto("/app/insights");
  await expect(page).toHaveURL(/\/app\/insights/);
  await expect(page.getByText(/Recovery nudge|복구 알림/i)).toBeVisible();
  await expect(
    page.getByText(/2-minute action|최소 행동|완벽하게 다시 시작할 필요는 없어요/i)
  ).toBeVisible();

  const ackRequest = page.waitForRequest(
    (req) => req.url().includes("/api/recovery/nudge/ack") && req.method() === "POST"
  );
  await page.getByRole("button", { name: /Dismiss|확인/i }).click();
  await ackRequest;
});
