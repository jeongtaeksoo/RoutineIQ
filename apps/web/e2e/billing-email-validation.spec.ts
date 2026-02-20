import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("billing email conversion CTA is enabled only when form is valid", async ({ page }) => {
  await installRoutineApiMock(page);

  await page.goto("/app/billing?from=settings");
  const convertButton = page.getByTestId("create-account-continue");

  await expect(convertButton).toBeDisabled();

  await page.getByLabel(/이메일|Email|メール|Correo/i).fill("invalid-email");
  await page.getByLabel(/^비밀번호$|^Password$|^パスワード$|^Contraseña$/i).fill("RutineIQ123!");
  await page.getByLabel(/비밀번호 확인|Confirm password|パスワード確認|Confirmar contraseña/i).fill("RutineIQ123!");
  await expect(convertButton).toBeDisabled();

  await page.getByLabel(/이메일|Email|メール|Correo/i).fill("demo-user@routineiq.test");
  await expect(convertButton).toBeEnabled();

  await page.getByLabel(/비밀번호 확인|Confirm password|パスワード確認|Confirmar contraseña/i).fill("Mismatch123!");
  await expect(convertButton).toBeDisabled();

  await page.getByLabel(/비밀번호 확인|Confirm password|パスワード確認|Confirmar contraseña/i).fill("RutineIQ123!");
  await expect(convertButton).toBeEnabled();

  await page
    .getByLabel(/비밀번호 확인|Confirm password|パスワード確認|Confirmar contraseña/i)
    .press("Enter");
  await expect(page.getByTestId("continue-checkout")).toBeVisible();
});
