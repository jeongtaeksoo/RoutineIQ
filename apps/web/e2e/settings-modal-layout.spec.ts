import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("quick settings modal is content-sized (no forced square layout)", async ({ page }) => {
  await installRoutineApiMock(page);

  await page.goto("/app/billing");
  await page.getByRole("button", { name: /설정|Settings/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await page.getByRole("tab", { name: /계정|Account/i }).click();
  await page.waitForTimeout(150);

  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThan(box!.width - 20);
});
