import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

type ActivationState = {
  profile_complete: boolean;
  has_any_log: boolean;
  has_any_report: boolean;
};

function nextStep(state: ActivationState): "profile" | "log" | "analyze" | "complete" {
  if (!state.profile_complete) return "profile";
  if (!state.has_any_log) return "log";
  if (!state.has_any_report) return "analyze";
  return "complete";
}

test("gate revalidates activation and allows today/plan after completion in same session", async ({
  page,
}) => {
  await installRoutineApiMock(page);

  const activation: ActivationState = {
    profile_complete: true,
    has_any_log: false,
    has_any_report: false,
  };

  await page.route("**/api/me/activation", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...activation,
        activation_complete: activation.profile_complete && activation.has_any_log && activation.has_any_report,
        next_step: nextStep(activation),
      }),
    });
  });

  await page.route("**/api/logs", async (route) => {
    if (route.request().method().toUpperCase() === "POST") {
      activation.has_any_log = true;
    }
    await route.fallback();
  });

  await page.route("**/api/analyze", async (route) => {
    if (route.request().method().toUpperCase() === "POST") {
      activation.has_any_report = true;
    }
    await route.fallback();
  });

  const date = await page.evaluate(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

  await page.goto("/app/log");
  await expect(page).toHaveURL(/\/app\/log/);

  await page.evaluate(async (targetDate: string) => {
    await fetch("/api/logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: targetDate,
        entries: [
          {
            start: "09:00",
            end: "10:00",
            activity: "핵심 작업",
            energy: 4,
            focus: 4,
          },
        ],
      }),
    });

    await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: targetDate, force: true }),
    });
  }, date);

  await page.goto("/app/today");
  await expect(page).toHaveURL(/\/app\/today/);

  await page.goto("/app/plan");
  await expect(page).toHaveURL(/\/app\/plan/);
});
