import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

const e2eMode = process.env.E2E_MODE === "live" ? "live" : "mock";

async function signInAsDemo(page: import("@playwright/test").Page) {
  await page.goto("/login?demo=1");
  await expect(page).toHaveURL(/\/app\/insights/);
}

async function signInLive(page: import("@playwright/test").Page) {
  await page.goto("/login");
  const { email, password, accessToken } = await provisionLiveUserCredentials();
  await page.getByRole("button", { name: /로그인|Sign in|Login|ログイン|登录|Iniciar sesión/i }).first().click();
  await page.getByLabel(/이메일|Email|メールアドレス|电子邮件|Correo/i).fill(email);
  await page.getByLabel(/^비밀번호$|^Password$|^パスワード$|^密码$|^Contraseña$/i).fill(password);
  await page.locator("form button[type='submit']").click();

  // Bridge token for client API calls in live E2E (only when enabled by env).
  await page.evaluate((token: string) => {
    sessionStorage.setItem("routineiq_e2e_token", token);
    (window as any).__ROUTINEIQ_E2E_TOKEN__ = token;
  }, accessToken);
  await ensureProfileReady(accessToken);

  await expect(page).toHaveURL(/\/app\/insights/);
}

async function provisionLiveUserCredentials(): Promise<{ email: string; password: string; accessToken: string }> {
  const envEmail = process.env.E2E_DEMO_EMAIL;
  const envPassword = process.env.E2E_DEMO_PASSWORD;
  if (envEmail && envPassword) {
    const accessToken = await exchangePasswordToken(envEmail, envPassword);
    return { email: envEmail, password: envPassword, accessToken };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing live login credentials: set E2E_DEMO_EMAIL/PASSWORD or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const email = `live-e2e-${Date.now()}@routineiq.test`;
  const password = `RoutineIQ!${Date.now()}X`;
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { source: "playwright-live" },
    }),
  });
  if (!res.ok) {
    throw new Error(`Unable to provision live test user (${res.status})`);
  }
  const accessToken = await exchangePasswordToken(email, password);
  return { email, password, accessToken };
}

async function exchangePasswordToken(email: string, password: string): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY for live auth.");
  }
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  const token = typeof body?.access_token === "string" ? body.access_token : "";
  if (!res.ok || !token) {
    throw new Error(`Failed to get access token for live user (${res.status})`);
  }
  return token;
}

async function ensureProfileReady(accessToken: string): Promise<void> {
  const apiBaseRaw = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
  const apiBase = apiBaseRaw.replace(/\/+$/, "");
  const res = await fetch(`${apiBase}/api/preferences/profile`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      age_group: "25_34",
      gender: "prefer_not_to_say",
      job_family: "engineering",
      work_mode: "fixed",
      chronotype: "mixed",
      trend_opt_in: true,
      trend_compare_by: ["age_group", "job_family", "work_mode"],
      goal_keyword: "deep work",
      goal_minutes_per_day: 90,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Failed to prime profile prerequisites (${res.status})`);
  }
  const required = ["age_group", "gender", "job_family", "work_mode"] as const;
  const invalid = required.filter((k) => !body[k] || body[k] === "unknown");
  if (invalid.length) {
    throw new Error(`Profile prerequisites were not persisted (${invalid.join(",")})`);
  }
}

test.describe("RoutineIQ core flows", () => {
  test("F1: /login?demo=1 guest flow redirects to insights", async ({ page }) => {
    await installRoutineApiMock(page);

    await signInAsDemo(page);
    await expect(page.getByRole("heading", { name: /나의 하루|My Insights/i })).toBeVisible();
    await expect(page.locator("p", { hasText: /오늘의 한 마디|One-line Coaching/i }).first()).toBeVisible();
  });

  test("F2: Daily Flow save -> analyze -> report render", async ({ page }) => {
    if (e2eMode === "mock") {
      await installRoutineApiMock(page);
      await signInAsDemo(page);
    } else {
      await signInLive(page);
    }
    await page.goto("/app/daily-flow");
    await page.getByText(/딥워크|Deep Work/i).first().click();
    await page.getByRole("button", { name: /저장\s*&\s*분석|Save\s*&\s*Analyze/i }).first().click();

    await expect(page).toHaveURL(/\/app\/reports\/\d{4}-\d{2}-\d{2}/, {
      timeout: e2eMode === "live" ? 120_000 : 8_000,
    });
    await expect(page.getByText(/오늘의 요약|Your Day in Review/i)).toBeVisible();
    if (e2eMode === "mock") {
      await expect(page.getByText("지금은 25분 한 번만 끝내세요.")).toBeVisible();
    } else {
      await expect(page.getByText(/내일을 위한 추천 흐름|Tomorrow’s Smart Schedule/i)).toBeVisible();
    }
  });

  test("F3: Guest billing conversion -> checkout session request", async ({ page }) => {
    const mock = await installRoutineApiMock(page);

    await signInAsDemo(page);
    await page.goto("/app/billing");

    await page.getByLabel(/이메일|Email/i).fill("demo-user@routineiq.test");
    await page.getByLabel(/^비밀번호$|^Password$/i).fill("RoutineIQ123!");
    await page.getByLabel(/비밀번호 확인|Confirm password/i).nth(0).fill("RoutineIQ123!");
    await page.getByRole("button", { name: /계정 만들고 계속하기|Create account to continue/i }).click();

    await expect(page.getByTestId("continue-checkout")).toBeVisible();
    await page.getByTestId("continue-checkout").click();

    await expect(page).toHaveURL(/\/app\/billing\?checkout=ok/);
    expect(mock.checkoutCalls).toBe(1);
  });
});
