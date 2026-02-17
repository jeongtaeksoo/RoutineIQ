import { expect, test } from "@playwright/test";

test("mobile in-app browser shows external browser guidance for Google login", async ({ browser }) => {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.3.5",
    viewport: { width: 390, height: 844 },
  });

  const page = await context.newPage();
  await page.goto("/login");

  await expect(page.getByText(/인앱 브라우저/)).toBeVisible();
  await expect(page.getByRole("button", { name: /외부 브라우저로 열기/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Google로 로그인/ })).toBeVisible();

  await context.close();
});
