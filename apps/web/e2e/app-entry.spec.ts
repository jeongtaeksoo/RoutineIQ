import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("app index redirects to today in e2e mode", async ({ page }) => {
  await installRoutineApiMock(page);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/today/);
});
