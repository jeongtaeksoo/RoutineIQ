import type { Page, Route } from "@playwright/test";

type LogPayload = {
  date: string;
  entries: unknown[];
  note: string | null;
};

type MockState = {
  checkoutCalls: number;
};

const REPORT_FIXTURE = {
  schema_version: 2,
  summary: "오늘은 흐름이 끊기는 구간이 있었어요. 내일은 집중 블록 사이에 짧은 회복 버퍼를 넣어 리듬을 유지합니다.",
  productivity_peaks: [
    { start: "09:30", end: "11:00", reason: "방해가 적고 에너지가 안정적이었습니다." },
  ],
  failure_patterns: [
    { pattern: "연속 회의 뒤 집중 하락", trigger: "버퍼 없는 전환", fix: "회의 뒤 5분 정리 + 25분 스프린트" },
  ],
  tomorrow_routine: [
    { start: "09:30", end: "10:20", activity: "핵심 과업 1개 마감", goal: "중요 결과물 초안 완료" },
    { start: "10:20", end: "10:30", activity: "회복 버퍼", goal: "호흡/정리로 전환" },
  ],
  if_then_rules: [{ if: "집중이 10분 이상 끊기면", then: "5분 리셋 후 25분 타이머 시작" }],
  coach_one_liner: "지금은 25분 한 번만 끝내세요.",
  yesterday_plan_vs_actual: {
    comparison_note: "전일 추천 대비 회의 후 전환 구간에서 이탈이 있었습니다.",
    top_deviation: "버퍼 없는 연속 일정",
  },
  wellbeing_insight: {
    burnout_risk: "medium",
    energy_curve_forecast: "09:30-11:00 구간의 에너지 유지 가능성이 상대적으로 높습니다.",
    note: "집중 블록 사이에 5분 회복 버퍼를 고정하세요.",
  },
  micro_advice: [
    {
      action: "작업 전환 직전 3분 리셋",
      when: "회의/메시지 확인 전후",
      reason: "주의 잔여를 줄여 복귀 속도를 높입니다.",
      duration_min: 3,
    },
  ],
  weekly_pattern_insight: "최근 기록에서는 오전 집중 블록의 유지율이 가장 높았습니다.",
  analysis_meta: {
    input_quality_score: 38,
    profile_coverage_pct: 75,
    wellbeing_signals_count: 2,
    logged_entry_count: 2,
    schema_retry_count: 0,
    personalization_tier: "medium",
  },
};

export async function installRoutineApiMock(page: Page): Promise<MockState> {
  const logsByDate = new Map<string, LogPayload>();
  const reportsByDate = new Map<string, typeof REPORT_FIXTURE>();
  const state: MockState = { checkoutCalls: 0 };

  await page.route("**/api/**", async (route) => {
    await handleApiRoute(route, logsByDate, reportsByDate, state);
  });

  return state;
}

async function handleApiRoute(
  route: Route,
  logsByDate: Map<string, LogPayload>,
  reportsByDate: Map<string, typeof REPORT_FIXTURE>,
  state: MockState,
) {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method().toUpperCase();
  const path = url.pathname.replace(/^\/api/, "");

  if (path === "/logs" && method === "GET") {
    const date = url.searchParams.get("date") ?? "2026-02-13";
    const row = logsByDate.get(date) ?? { date, entries: [], note: null };
    return json(route, 200, row);
  }

  if (path === "/logs" && method === "POST") {
    const body = parseJsonSafe(request.postData());
    const date = typeof body?.date === "string" ? body.date : "2026-02-13";
    const payload: LogPayload = {
      date,
      entries: Array.isArray(body?.entries) ? body.entries : [],
      note: typeof body?.note === "string" ? body.note : null,
    };
    logsByDate.set(date, payload);
    return json(route, 200, { ok: true });
  }

  if (path === "/parse-diary" && method === "POST") {
    const body = parseJsonSafe(request.postData());
    const diary = typeof body?.diary_text === "string" ? body.diary_text : "";
    return json(route, 200, {
      entries: [
        {
          start: "09:30",
          end: "11:00",
          activity: "Deep work",
          energy: 4,
          focus: 5,
          note: diary.slice(0, 120) || null,
          tags: ["focus", "planning"],
          confidence: "high",
        },
        {
          start: "14:00",
          end: "15:00",
          activity: "Coordination",
          energy: 3,
          focus: 3,
          note: null,
          tags: ["meeting"],
          confidence: "medium",
        },
      ],
      meta: {
        mood: "good",
        sleep_quality: 4,
        sleep_hours: 7.0,
        stress_level: 2,
      },
      ai_note: "Parsed timeline is ready. Review low-confidence rows before saving.",
    });
  }

  if (path === "/analyze" && method === "POST") {
    const body = parseJsonSafe(request.postData());
    const date = typeof body?.date === "string" ? body.date : "2026-02-13";
    reportsByDate.set(date, REPORT_FIXTURE);
    return json(route, 200, { date, report: REPORT_FIXTURE, cached: false });
  }

  if (path === "/reports" && method === "GET") {
    const date = url.searchParams.get("date") ?? "2026-02-13";
    const report = reportsByDate.get(date);
    if (!report) {
      return json(route, 404, { detail: { message: "Report not found" } });
    }
    return json(route, 200, { date, report, model: "gpt-4.1-mini" });
  }

  if (path === "/trends/cohort" && method === "GET") {
    return json(route, 200, {
      enabled: false,
      insufficient_sample: false,
      min_sample_size: 50,
      preview_sample_size: 20,
      high_confidence_sample_size: 100,
      threshold_variant: "control",
      preview_mode: false,
      confidence_level: "low",
      cohort_size: 0,
      active_users: 0,
      window_days: 28,
      compare_by: [],
      filters: {},
      metrics: {
        focus_window_rate: null,
        rebound_rate: null,
        recovery_buffer_day_rate: null,
        focus_window_numerator: 0,
        focus_window_denominator: 0,
        rebound_numerator: 0,
        rebound_denominator: 0,
        recovery_day_numerator: 0,
        recovery_day_denominator: 0,
      },
      message: "테스트 모드: 코호트 데이터를 비활성화했습니다.",
      my_focus_rate: null,
      my_rebound_rate: null,
      my_recovery_rate: null,
      my_focus_delta_7d: null,
      my_rebound_delta_7d: null,
      my_recovery_delta_7d: null,
      rank_label: "",
      actionable_tip: "",
    });
  }

  if (path === "/trends/cohort/event" && method === "POST") {
    return json(route, 200, { ok: true });
  }

  if (path === "/insights/weekly" && method === "GET") {
    return json(route, 200, {
      from_date: "2026-02-07",
      to_date: "2026-02-13",
      consistency: {
        score: 0,
        days_logged: 0,
        days_total: 7,
        series: [
          { date: "2026-02-07", day: "02-07", blocks: 0 },
          { date: "2026-02-08", day: "02-08", blocks: 0 },
          { date: "2026-02-09", day: "02-09", blocks: 0 },
          { date: "2026-02-10", day: "02-10", blocks: 0 },
          { date: "2026-02-11", day: "02-11", blocks: 0 },
          { date: "2026-02-12", day: "02-12", blocks: 0 },
          { date: "2026-02-13", day: "02-13", blocks: 0 },
        ],
      },
      weekly: {
        days_logged: 0,
        days_total: 7,
        total_blocks: 0,
        deep_minutes: 0,
        goal: null,
      },
    });
  }

  if (path === "/preferences/profile" && method === "GET") {
    return json(route, 200, {
      age_group: "unknown",
      gender: "unknown",
      job_family: "unknown",
      work_mode: "unknown",
      trend_opt_in: true,
      trend_compare_by: ["age_group", "job_family", "work_mode"],
      goal_keyword: null,
      goal_minutes_per_day: null,
    });
  }

  if (path === "/preferences/profile" && method === "PUT") {
    const body = parseJsonSafe(request.postData()) || {};
    return json(route, 200, {
      age_group: typeof body.age_group === "string" ? body.age_group : "unknown",
      gender: typeof body.gender === "string" ? body.gender : "unknown",
      job_family: typeof body.job_family === "string" ? body.job_family : "unknown",
      work_mode: typeof body.work_mode === "string" ? body.work_mode : "unknown",
      trend_opt_in: typeof body.trend_opt_in === "boolean" ? body.trend_opt_in : true,
      trend_compare_by: Array.isArray(body.trend_compare_by) ? body.trend_compare_by : ["age_group", "job_family", "work_mode"],
      goal_keyword: typeof body.goal_keyword === "string" ? body.goal_keyword : null,
      goal_minutes_per_day: typeof body.goal_minutes_per_day === "number" ? body.goal_minutes_per_day : null,
    });
  }

  if (path === "/preferences/data" && method === "DELETE") {
    return json(route, 200, { ok: true });
  }

  if (path === "/preferences/account" && method === "DELETE") {
    return json(route, 200, { ok: true });
  }

  if (path === "/recovery/active" && method === "GET") {
    return json(route, 200, {
      has_open_session: false,
      correlation_id: "e2e",
    });
  }

  if (path === "/recovery/nudge" && method === "GET") {
    return json(route, 200, {
      has_nudge: false,
      nudge: null,
      correlation_id: "e2e",
    });
  }

  if (path === "/recovery/nudge/ack" && method === "POST") {
    return json(route, 200, { ok: true });
  }

  if (path === "/demo/seed" && method === "POST") {
    return json(route, 200, {
      ok: true,
      seeded_days: 7,
      from_date: "2026-02-07",
      to_date: "2026-02-13",
      reports_seeded: false,
    });
  }

  if (path === "/stripe/status" && method === "GET") {
    return json(route, 200, { enabled: true });
  }

  if (path === "/stripe/create-checkout-session" && method === "POST") {
    state.checkoutCalls += 1;
    const origin = `${url.protocol}//${url.host}`;
    return json(route, 200, { url: `${origin}/app/insights?checkout=ok` });
  }

  return json(route, 404, { detail: { message: `Unhandled mock route: ${method} ${path}` } });
}

function parseJsonSafe(value: string | null): any {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}
