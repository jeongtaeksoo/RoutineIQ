import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

for (const vp of viewports) {
  test(`preferences route redirects to settings profile page on ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await installRoutineApiMock(page);

    await page.goto("/app/preferences");
    await expect(page).toHaveURL(/\/app\/settings\/profile/);
    await expect(page.getByRole("heading", { name: /설정|Settings|設定|设置/i })).toBeVisible();
    await expect(page.getByText(/개인 설정|Profile/i).first()).toBeVisible();
  });
}

test("privacy data reset requires DELETE confirmation and calls API", async ({ page }) => {
  await installRoutineApiMock(page);
  let deleteCalled = 0;

  await page.route("**/api/preferences/data", async (route) => {
    deleteCalled += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/app/settings/privacy");
  await expect(page).toHaveURL(/\/app\/settings\/privacy/);

  const deleteButton = page.getByRole("button", {
    name: /기록\/리포트 전체 삭제|Delete all logs\/reports/i,
  });
  await expect(deleteButton).toBeDisabled();

  await page.getByPlaceholder("DELETE").fill("DELETE");
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();

  await expect.poll(() => deleteCalled).toBe(1);
  await expect(
    page.getByText(
      /모든 기록\/리포트 데이터가 삭제되었습니다|All log\/report data has been deleted/i,
    ),
  ).toBeVisible();
});
