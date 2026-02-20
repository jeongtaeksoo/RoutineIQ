import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

test("billing checkout shows retry recovery after timeout and succeeds on retry", async ({ page }) => {
  await installRoutineApiMock(page);

  let checkoutAttempts = 0;
  await page.route("**/api/stripe/create-checkout-session", async (route) => {
    checkoutAttempts += 1;
    if (checkoutAttempts === 1) {
      await route.fulfill({
        status: 504,
        contentType: "application/json",
        body: JSON.stringify({ detail: { message: "Request timed out", code: "timeout" } }),
      });
      return;
    }
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: `${url.protocol}//${url.host}/app/today?checkout=ok` }),
    });
  });

  await page.goto("/app/billing");

  await page.getByLabel(/이메일|Email/i).first().fill("demo-user@routineiq.test");
  await page.getByLabel(/^비밀번호$|^Password$/i).first().fill("RutineIQ123!");
  await page.getByLabel(/비밀번호 확인|Confirm password/i).first().fill("RutineIQ123!");
  await page.getByRole("button", { name: /계정 만들고 계속하기|Create account to continue/i }).first().click();

  await expect(page.getByTestId("continue-checkout")).toBeVisible();
  await page.getByTestId("continue-checkout").click();

  await expect(
    page.getByText(/결제 준비 시간이 초과되었습니다|Checkout setup timed out/i).first()
  ).toBeVisible();
  await page.getByRole("button", { name: /결제 다시 시도|Retry checkout/i }).first().click();

  await expect(page).toHaveURL(/\/app\/today\?checkout=ok/);
  expect(checkoutAttempts).toBe(2);
});
