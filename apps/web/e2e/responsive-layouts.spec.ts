import { expect, test } from "@playwright/test";

const viewports = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

for (const vp of viewports) {
  test(`responsive layout is stable on ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/app/insights");
    await expect(page).toHaveURL(/\/app\/insights/);
    await expect(page.getByRole("heading", { name: /나의 하루|My Insights/i })).toBeVisible();

    await page.goto("/app/daily-flow");
    await expect(page.getByRole("heading", { name: /기록하기|Daily Flow/i })).toBeVisible();

    await page.goto(`/app/reports/${todayLocal()}`);
    await expect(page.getByRole("heading", { name: /나의 하루 리포트|AI Coach Report/i })).toBeVisible();

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - window.innerWidth;
    });
    expect(overflow).toBeLessThan(2);
  });
}
