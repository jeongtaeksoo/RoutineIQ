import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

for (const vp of viewports) {
  test(`preferences route redirects to insights settings modal on ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await installRoutineApiMock(page);

    await page.goto("/app/preferences");
    await expect(page).toHaveURL(/\/app\/insights/);
    await expect(page.getByRole("heading", { name: /빠른 설정|Quick Settings|クイック設定|快速设置|Configuración rápida/i })).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /개인설정|Profile|プロフィール|个人设置|Perfil/i }),
    ).toHaveAttribute("data-state", "active");
  });
}

test("settings data reset calls API and shows success feedback", async ({ page }) => {
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

  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  await page.goto("/app/insights");
  await page.getByRole("button", { name: /설정|Settings|設定|设置|configuración/i }).click();
  await page.getByRole("tab", { name: /데이터 제어|Data control|データ管理|数据控制|control de datos/i }).click();
  await page.getByRole("button", { name: /데이터 전체 초기화|Reset all data|すべてのデータを初期化|重置所有数据|Restablecer todos los datos/i }).click();

  await expect.poll(() => deleteCalled).toBe(1);
  await expect(
    page.getByText(/데이터가 초기화되었습니다|All data has been reset|データを初期化しました|数据已重置|Todos los datos se han restablecido/i),
  ).toBeVisible();
});

