import { expect, test } from "@playwright/test";

import { installRoutineApiMock } from "./helpers/mock-api";

const e2eMode = process.env.E2E_MODE === "live" ? "live" : "mock";

async function enterMockApp(page: import("@playwright/test").Page) {
  await page.goto("/app/insights");
  await expect(page).toHaveURL(/\/app\/insights/);
}

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function signInLive(
  page: import("@playwright/test").Page,
): Promise<{ accessToken: string }> {
  await page.goto("/login?auth=1");
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
  return { accessToken };
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
  const password = `RutineIQ!${Date.now()}X`;
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
      job_family: "office_worker",
      work_mode: "fixed",
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

async function seedLiveDay({
  accessToken,
  date,
}: {
  accessToken: string;
  date: string;
}): Promise<void> {
  const apiBaseRaw = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
  const apiBase = apiBaseRaw.replace(/\/+$/, "");
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${accessToken}`,
  };
  const logRes = await fetch(`${apiBase}/api/logs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      date,
      entries: [
        {
          start: "09:00",
          end: "10:00",
          activity: "Focus block",
          energy: 4,
          focus: 4,
          tags: ["focus"],
        },
      ],
      note: "Live smoke seed log",
      meta: {
        mood: "good",
        sleep_quality: 4,
        sleep_hours: 7,
        stress_level: 2,
      },
    }),
  });
  if (!logRes.ok) {
    throw new Error(`Failed to seed live log (${logRes.status})`);
  }

  const waitForReport = async (seconds: number): Promise<boolean> => {
    const tries = Math.max(1, Math.ceil(seconds / 3));
    for (let i = 0; i < tries; i += 1) {
      const reportRes = await fetch(`${apiBase}/api/reports?date=${encodeURIComponent(date)}`, {
        method: "GET",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (reportRes.ok) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    return false;
  };

  let lastStatus = 0;
  let lastDetail = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const analyzeRes = await fetch(`${apiBase}/api/analyze`, {
      method: "POST",
      headers,
      body: JSON.stringify({ date, force: true }),
    });
    if (analyzeRes.ok) {
      return;
    }
    lastStatus = analyzeRes.status;
    lastDetail = (await analyzeRes.text()).slice(0, 400);

    if (lastStatus === 409 && lastDetail.includes("ANALYZE_IN_PROGRESS")) {
      if (await waitForReport(45)) {
        return;
      }
      continue;
    }

    if ([429, 500, 502, 503, 504].includes(lastStatus) && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
      continue;
    }
    break;
  }
  throw new Error(`Failed to seed live report (${lastStatus}): ${lastDetail}`);
}

test.describe("RutineIQ core flows", () => {
  test("F1: core app shell loads to insights", async ({ page }) => {
    await installRoutineApiMock(page);
    if (e2eMode === "mock") {
      await enterMockApp(page);
    } else {
      await signInLive(page);
    }
    await expect(page.getByRole("heading", { name: /나의 하루|My Insights/i })).toBeVisible();
    await expect(page.locator("p", { hasText: /오늘의 한 마디|One-line Coaching/i }).first()).toBeVisible();
    await expect(
      page
        .getByText(/아직 오늘 리포트가 없어요|No report for today yet|데이터 충분성|Data sufficiency/i)
        .first(),
    ).toBeVisible();
  });

  test("F2: Daily Flow save -> analyze -> report render", async ({ page }) => {
    if (e2eMode === "live") {
      test.setTimeout(180_000);
    }
    if (e2eMode === "mock") {
      await installRoutineApiMock(page);
      await enterMockApp(page);
    } else {
      const { accessToken } = await signInLive(page);
      const date = todayLocal();
      await seedLiveDay({ accessToken, date });
      await page.goto(`/app/reports/${date}`);
      await expect(page).toHaveURL(/\/app\/reports\/\d{4}-\d{2}-\d{2}/, {
        timeout: 120_000,
      });
      await expect(page.getByRole("heading", { name: /나의 하루 리포트|AI Coach Report/i })).toBeVisible();
      await expect(page.getByText(/내일을 위한 추천 흐름|Tomorrow’s Smart Schedule/i)).toBeVisible();
      return;
    }
    await page.goto("/app/daily-flow");
    const diaryText = "09:00부터 집중 코딩을 했고 점심 이후 회의를 진행한 뒤 저녁에 산책했습니다.";
    const diaryInput = page.locator("textarea");
    const parseButton = page.getByRole("button", { name: /AI 분석하기|Parse with AI/i }).first();
    await diaryInput.fill(diaryText);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await parseButton.isEnabled()) break;
      await page.waitForTimeout(400);
      await diaryInput.fill(diaryText);
    }
    await expect(diaryInput).toHaveValue(diaryText);
    await expect(parseButton).toBeEnabled({ timeout: 15_000 });
    await parseButton.click();
    await expect(page.getByText(/AI가 (이렇게 파악했어요|정리한 결과예요)|AI parsed your day like this/i)).toBeVisible();
    await page.getByRole("button", { name: /확인\s*&\s*저장|Confirm\s*&\s*Save/i }).first().click();
    await expect(page.getByText(/저장 완료! AI 분석을 (시작할까요|해볼까요)\?|Saved! Start AI analysis\?/i)).toBeVisible();
    await page.getByRole("button", { name: /AI 분석|AI Analyze/i }).first().click();

    await expect(page).toHaveURL(/\/app\/reports\/\d{4}-\d{2}-\d{2}/, {
      timeout: 8_000,
    });
    await expect(page.getByRole("heading", { name: /나의 하루 리포트|AI Coach Report/i })).toBeVisible();
    await expect(page.getByText(/오늘의 요약|Your Day in Review/i)).toBeVisible();
    await expect(page.getByText("지금은 25분 한 번만 끝내세요.")).toBeVisible();
    await expect(
      page.getByText(/(신호가 부족해 분석 확신도가 낮습니다|데이터가 부족해 정확도가 낮아요)|Signal quality is limited/i),
    ).toBeVisible();
  });

  test("F2b: parse-diary 502 shows retry, then succeeds", async ({ page }) => {
    test.skip(e2eMode === "live", "Mock-only API error handling scenario");
    await installRoutineApiMock(page);
    let parseAttempt = 0;
    await page.route("**/api/parse-diary", async (route) => {
      parseAttempt += 1;
      if (parseAttempt === 1) {
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({
            detail: {
              code: "PARSE_UPSTREAM_TIMEOUT",
              message: "AI diary parsing timed out. Please try again.",
              hint: "Reference ID: e2e-timeout. Please retry once in a few seconds.",
              retryable: true,
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          entries: [
            {
              start: "09:30",
              end: "11:00",
              activity: "Deep work",
              energy: 4,
              focus: 5,
              note: null,
              tags: ["focus"],
              confidence: "high",
            },
          ],
          meta: {
            mood: "good",
            sleep_quality: 4,
            sleep_hours: 7.0,
            stress_level: 2,
          },
          ai_note: "Parsed timeline is ready.",
        }),
      });
    });

    await enterMockApp(page);
    await page.goto("/app/daily-flow");
    await page.locator("textarea").fill("09:30부터 집중 코딩을 했고 오후에는 회의 후 정리했습니다.");
    await page.getByRole("button", { name: /AI 분석하기|Parse with AI/i }).first().click();

    await expect(
      page.getByText(/(AI 응답이 지연되고 있어요|AI가 느려요)|AI response timed out/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /다시 시도|Retry parse/i })).toBeVisible();

    await page.getByRole("button", { name: /다시 시도|Retry parse/i }).click();
    await expect(page.getByText(/AI가 (이렇게 파악했어요|정리한 결과예요)|AI parsed your day like this/i)).toBeVisible();
  });

  test("F2d: unknown entry -> one-tap window chip -> save succeeds", async ({ page }) => {
    test.skip(e2eMode === "live", "Mock-only ambiguity resolution scenario");
    await installRoutineApiMock(page);
    await page.route("**/api/parse-diary", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          entries: [
            {
              start: null,
              end: null,
              activity: "보고서 작성",
              energy: null,
              focus: null,
              note: null,
              tags: ["문서"],
              confidence: "low",
              source_text: "하루종일 보고서를 썼다",
              time_source: "unknown",
              time_confidence: "low",
              time_window: null,
              crosses_midnight: false,
            },
          ],
          meta: {
            mood: "neutral",
            sleep_quality: null,
            sleep_hours: null,
            stress_level: 3,
            parse_issues: ["entry[1] time downgraded to null (no explicit time evidence)"],
          },
          ai_note: "시간 근거가 부족해 확인이 필요합니다.",
        }),
      });
    });

    await enterMockApp(page);
    await page.goto("/app/daily-flow");
    await page.locator("textarea").fill("하루종일 보고서를 썼다. 중간에 커피를 마시며 쉬었다.");
    await page.getByRole("button", { name: /AI 분석하기|Parse with AI/i }).first().click();
    await expect(page.getByText(/(확인하면 더 정확해져요|한번 확인하면 정확도가 올라가요)|quick check makes this more accurate/i)).toBeVisible();

    await page.getByRole("button", { name: /아침|Morning/i }).first().click();
    await page.getByRole("button", { name: /확인\s*&\s*저장|Confirm\s*&\s*Save/i }).first().click();
    await expect(page.getByText(/저장 완료! AI 분석을 (시작할까요|해볼까요)\?|Saved! Start AI analysis\?/i)).toBeVisible();
  });

  test("F2e: draft text and parsed entries persist after focus revalidation", async ({ page }) => {
    test.skip(e2eMode === "live", "Mock-only draft preservation scenario");
    await installRoutineApiMock(page);
    await enterMockApp(page);
    await page.goto("/app/daily-flow");

    const diaryText = "09:00~10:00 집중 코딩 후 오후에는 회의와 정리를 진행했다.";
    const diaryInput = page.locator("textarea");
    await diaryInput.fill(diaryText);
    await expect(diaryInput).toHaveValue(diaryText);

    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await page.waitForTimeout(250);
    await expect(diaryInput).toHaveValue(diaryText);

    await page.getByRole("button", { name: /AI 분석하기|Parse with AI/i }).first().click();
    await expect(page.getByText(/AI가 (이렇게 파악했어요|정리한 결과예요)|AI parsed your day like this/i)).toBeVisible();
    await expect(page.locator("p.mt-1.font-medium").filter({ hasText: "Deep work" }).first()).toBeVisible();

    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await page.waitForTimeout(250);

    await expect(page.getByText(/AI가 (이렇게 파악했어요|정리한 결과예요)|AI parsed your day like this/i)).toBeVisible();
    await expect(page.locator("p.mt-1.font-medium").filter({ hasText: "Deep work" }).first()).toBeVisible();
  });

  test("F2c: report 404 renders empty-state card, not error banner", async ({ page }) => {
    test.skip(e2eMode === "live", "Mock-only empty-state scenario");
    await installRoutineApiMock(page);
    await enterMockApp(page);
    await page.goto(`/app/reports/${todayLocal()}`);
    await expect(page.getByText(/(리포트를 만들 준비가 되었나요\?|리포트를 만들어 볼까요\?)|No report yet/i)).toBeVisible();
    await expect(page.getByText(/리포트를 불러오지 못했습니다|Failed to load report/i)).toHaveCount(0);
  });

  test("F3: Settings account tab upgrade -> checkout session request", async ({ page }) => {
    const mock = await installRoutineApiMock(page);

    await enterMockApp(page);
    await page.goto("/app/insights");
    await page.getByRole("button", { name: /설정|Settings/i }).click();
    await page.getByRole("tab", { name: /계정|Account/i }).click();

    await page.getByLabel(/이메일|Email/i).first().fill("demo-user@routineiq.test");
    await page.getByLabel(/^비밀번호$|^Password$/i).first().fill("RutineIQ123!");
    await page.getByLabel(/비밀번호 확인|Confirm password/i).first().fill("RutineIQ123!");
    await page.getByRole("button", { name: /계정 만들고 계속하기|Create account to continue/i }).click();

    await expect(page.getByTestId("continue-checkout")).toBeVisible();
    await page.getByTestId("continue-checkout").click();

    await expect(page).toHaveURL(/\/app\/insights\?checkout=ok/);
    expect(mock.checkoutCalls).toBe(1);
  });
});
