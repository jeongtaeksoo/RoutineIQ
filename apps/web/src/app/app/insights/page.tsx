"use client";

import * as React from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, isApiFetchError } from "@/lib/api-client";
import { DAILY_FLOW_TEMPLATES, DEFAULT_TEMPLATE_NAME } from "@/lib/daily-flow-templates";
import { downloadWeeklyShareCard } from "@/lib/share-card";
import { isE2ETestMode } from "@/lib/supabase/env";

type AIReport = {
  summary: string;
  productivity_peaks: { start: string; end: string; reason: string }[];
  failure_patterns: { pattern: string; trigger: string; fix: string }[];
  tomorrow_routine: { start: string; end: string; activity: string; goal: string }[];
  if_then_rules: { if: string; then: string }[];
  coach_one_liner: string;
  yesterday_plan_vs_actual: { comparison_note: string; top_deviation: string };
};

type GoalPrefs = {
  keyword: string;
  minutesPerDay: number;
};

type WeeklyInsightsResponse = {
  from_date: string;
  to_date: string;
  consistency: {
    score: number;
    days_logged: number;
    days_total: number;
    series: { date: string; day: string; blocks: number }[];
  };
  weekly: {
    days_logged: number;
    days_total: number;
    total_blocks: number;
    deep_minutes: number;
    goal: { keyword: string; minutes_per_day: number } | null;
  };
};

type CohortTrend = {
  enabled: boolean;
  insufficient_sample: boolean;
  min_sample_size: number;
  cohort_size: number;
  active_users: number;
  window_days: number;
  compare_by: string[];
  filters: Record<string, string>;
  metrics: {
    focus_window_rate: number | null;
    rebound_rate: number | null;
    recovery_buffer_day_rate: number | null;
    focus_window_numerator: number;
    focus_window_denominator: number;
    rebound_numerator: number;
    rebound_denominator: number;
    recovery_day_numerator: number;
    recovery_day_denominator: number;
  };
  message: string;
};

function localYYYYMMDD(d = new Date()) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function InsightsPage() {
  const locale = useLocale();
  const isKo = locale === "ko";

  const t = React.useMemo(() => {
    if (isKo) {
      return {
        title: "나의 하루",
        subtitle: "기록하고, 돌아보고, 내일을 준비합니다. 오늘 챙겨야 할 하나만 확인하세요.",
        todayLabel: "오늘",
        coachTitle: "오늘의 한 마디",
        coachDesc: "기록을 바탕으로, 지금 실행할 행동 1개를 제안합니다.",
        coachEmptyTitle: "아직 오늘 리포트가 없어요",
        coachEmptyBody_noLog: "먼저 Daily Flow를 기록하면, 오늘의 한 마디가 생성됩니다.",
        coachEmptyBody_hasLog: "기록은 완료됐어요. AI로 정리하면 오늘의 한 마디가 바로 생성됩니다.",
        coachEmptyHint: "오른쪽 '다음 단계'에서 바로 진행할 수 있어요.",
        nextTitle: "다음 단계",
        nextDesc_noLog: "아직 기록이 없네요. 3분이면 충분합니다. 템플릿으로 오늘을 가볍게 정리해보세요.",
        nextDesc_noReport: "오늘 기록을 바탕으로, 내일 흐름을 같이 잡아봅니다.",
        nextDesc_hasReport: "내일 일정을 미리 보고, 여유가 필요한 곳을 찾아보세요.",
        cta_start3min: "3분으로 시작하기",
        cta_analyzeNow: "AI로 정리하기",
        cta_viewTomorrow: "내일 준비하기",
        cta_editLog: "기록 열기",
        cta_openReport: "리포트 전체보기",
      cta_reload: "새로고침",
      cta_seedDemo: "데모 7일 시드 생성",
      cta_seeding: "데모 시드 생성 중...",
      seedDone: "최근 7일 데모 기록이 준비되었습니다.",
      progress: "진행 상황",
        step_log: "기록",
        step_analyze: "정리",
        step_plan: "내일 준비",
        analyzing: "정리하는 중...",
        loading: "불러오는 중...",
        tomorrowSchedule: "내일의 추천 흐름",
        tomorrowScheduleDesc: "당신의 패턴에 맞춰, 무리 없는 내일을 그려봤어요.",
        scheduleEmptyTitle: "분석을 실행하면 내일 계획이 생성됩니다",
        scheduleEmptyBody: "시간표와 복구 규칙이 이 영역에 표시됩니다.",
        moreBlocks: (n: number) => `+ ${n}개 더 보기`,
        coachTip: "오늘의 팁",
        coachTipDesc: "부담 없이 실천할 수 있는 한 줄.",
        peakHours: "집중 잘 되는 시간",
        peakHoursDesc: "몰입이 자연스럽게 일어나는 시간대입니다.",
        peakHoursEmpty: "분석을 실행하면, 집중이 잘 되는 시간대가 표시됩니다.",
        breakTriggers: "집중을 방해하는 것들",
        breakTriggersDesc: "나도 모르게 흐름이 끊기는 순간들.",
        breakTriggersEmpty: "분석을 실행하면, 흐름을 깨는 패턴이 표시됩니다.",
        fixLabel: "해결안",
        consistency: "꾸준함 점수",
        consistencyDesc: "하루를 기록하며 나를 돌본 날들입니다. (최근 7일)",
        daysLogged: "기록한 날",
        downloadShare: "기록 공유하기",
        tip: "팁: 매일 조금씩 기록하면, 나에게 더 잘 맞는 제안을 받을 수 있어요.",
        weeklyTitle: "이번 주 요약",
        weeklyDesc: "지난 7일간의 나의 모습입니다.",
        totalBlocks7d: "기록한 활동 수",
        deepMinutes7d: "몰입한 시간 (7일)",
        emptyMetricsTitle: "데이터가 쌓이고 있어요",
        emptyMetricsBody: "오늘 첫 기록을 남겨보세요. 3일만 쌓여도 내 패턴이 보이기 시작합니다.",
        detailsTitle: "주간 지표 더보기",
        detailsSubtitle: "꾸준함 그래프와 주간 요약",
      };
    }
    return {
      title: "My Insights",
      subtitle: "Log → Analyze → Tomorrow plan. Follow one next action.",
      todayLabel: "Today",
      coachTitle: "One-line Coaching",
      coachDesc: "Based on your log, we suggest one action you can do now.",
      coachEmptyTitle: "No report for today yet",
      coachEmptyBody_noLog: "Start with today's Daily Flow log to generate your one-line coaching.",
      coachEmptyBody_hasLog: "Your log is ready. Run Analyze to generate today's one-line coaching.",
      coachEmptyHint: "Use the Next Action card on the right to continue.",
      nextTitle: "Next Action",
      nextDesc_noLog: "No log yet. Start with a template and finish your first analysis in 3 minutes.",
      nextDesc_noReport: "Turn your log into a coached tomorrow plan.",
      nextDesc_hasReport: "Review tomorrow’s plan and add buffers where you usually break.",
      cta_start3min: "Start in 3 min",
      cta_analyzeNow: "Analyze my day",
      cta_viewTomorrow: "View tomorrow plan",
      cta_editLog: "Open today log",
      cta_openReport: "Open report",
      cta_reload: "Reload report",
      cta_seedDemo: "Seed 7-day demo data",
      cta_seeding: "Seeding demo data...",
      seedDone: "Demo logs for last 7 days are ready.",
      progress: "Progress",
      step_log: "Log",
      step_analyze: "Analyze",
      step_plan: "Tomorrow plan",
      analyzing: "Analyzing...",
      loading: "Loading...",
      tomorrowSchedule: "Tomorrow’s Smart Schedule",
      tomorrowScheduleDesc: "Auto-designed routine based on your actual day patterns.",
      scheduleEmptyTitle: "Run Analyze to generate tomorrow's plan",
      scheduleEmptyBody: "Your timeline and recovery rules will appear here.",
      moreBlocks: (n: number) => `+ ${n} more blocks`,
      coachTip: "Coach Tip of the Day",
      coachTipDesc: "One actionable sentence, no fluff.",
      peakHours: "Peak Performance Hours",
      peakHoursDesc: "When deep work is most likely to stick.",
      peakHoursEmpty: "Run Analyze to see when your focus is strongest.",
      breakTriggers: "Focus Break Triggers",
      breakTriggersDesc: "Patterns that reliably derail you.",
      breakTriggersEmpty: "Run Analyze to identify patterns that break your flow.",
      fixLabel: "Fix",
      consistency: "Consistency Score",
      consistencyDesc: "How often you logged your day (since you started). Chart shows last 7 days.",
      daysLogged: "Days logged",
      downloadShare: "Download share card",
      tip: "Tip: log a little daily so the AI loop can improve.",
      weeklyTitle: "Weekly Trend Snapshot",
      weeklyDesc: "Simple metrics from your last 7 days (no extra AI calls).",
      totalBlocks7d: "Total blocks (7d)",
      deepMinutes7d: "Deep Work Minutes (7d)",
      emptyMetricsTitle: "Building your baseline",
      emptyMetricsBody: "Your first log starts the score. After 3 days, patterns show up fast.",
      detailsTitle: "More weekly metrics",
      detailsSubtitle: "Consistency chart and weekly snapshot",
    };
  }, [isKo]);

  const today = React.useMemo(() => localYYYYMMDD(), []);
  const [report, setReport] = React.useState<AIReport | null>(null);
  const [reportLoading, setReportLoading] = React.useState(true);
  const [reportError, setReportError] = React.useState<string | null>(null);
  const [infoMessage, setInfoMessage] = React.useState<string | null>(null);

  const [analyzing, setAnalyzing] = React.useState(false);
  const [seeding, setSeeding] = React.useState(false);
  const [todayLogBlocks, setTodayLogBlocks] = React.useState<number>(0);

  const [consistency, setConsistency] = React.useState<{
    score: number;
    series: { day: string; blocks: number }[];
  }>({ score: 0, series: [] });
  const [weekly, setWeekly] = React.useState<{
    daysLogged: number;
    daysTotal: number;
    totalBlocks: number;
    deepMinutes: number;
    goal: GoalPrefs | null;
  }>({ daysLogged: 0, daysTotal: 0, totalBlocks: 0, deepMinutes: 0, goal: null });
  const [cohortTrend, setCohortTrend] = React.useState<CohortTrend | null>(null);
  const [cohortLoading, setCohortLoading] = React.useState(true);

  async function loadTodayLog() {
    try {
      const res = await apiFetch<{ date: string; entries: unknown[]; note: string | null }>(`/logs?date=${today}`);
      setTodayLogBlocks(Array.isArray(res.entries) ? res.entries.length : 0);
    } catch {
      setTodayLogBlocks(0);
    }
  }

  async function loadReport() {
    setReportError(null);
    setReportLoading(true);
    try {
      const res = await apiFetch<{ date: string; report: AIReport; model?: string }>(`/reports?date=${today}`);
      setReport(res.report);
    } catch (err) {
      // 404 = no report yet; treat as empty state.
      const status = isApiFetchError(err) ? err.status : null;
      if (status === 404) {
        setReport(null);
      } else {
        const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
        setReportError(err instanceof Error ? `${err.message}${hint}` : isKo ? "리포트를 불러오지 못했습니다" : "Failed to load report");
      }
    } finally {
      setReportLoading(false);
    }
  }

  async function analyze() {
    setAnalyzing(true);
    setReportError(null);
    setInfoMessage(null);
    try {
      const res = await apiFetch<{ date: string; report: AIReport; cached: boolean }>(`/analyze`, {
        method: "POST",
        body: JSON.stringify({ date: today, force: true })
      });
      setReport(res.report);
      await loadConsistency();
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setReportError(err instanceof Error ? `${err.message}${hint}` : isKo ? "분석에 실패했습니다" : "Analyze failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function quickstart() {
    setAnalyzing(true);
    setReportError(null);
    setInfoMessage(null);
    try {
      const log = await apiFetch<{ date: string; entries: unknown[]; note: string | null }>(`/logs?date=${today}`);
      const hasLog = Array.isArray(log.entries) && log.entries.length > 0;
      if (!hasLog) {
        const tmpl = DAILY_FLOW_TEMPLATES[DEFAULT_TEMPLATE_NAME] || [];
        await apiFetch(`/logs`, {
          method: "POST",
          body: JSON.stringify({ date: today, entries: tmpl, note: "Quickstart template" })
        });
        setTodayLogBlocks(tmpl.length);
      } else {
        setTodayLogBlocks((log.entries as unknown[]).length);
      }

      const res = await apiFetch<{ date: string; report: AIReport; cached: boolean }>(`/analyze`, {
        method: "POST",
        body: JSON.stringify({ date: today, force: true })
      });
      setReport(res.report);
      await loadConsistency();
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setReportError(err instanceof Error ? `${err.message}${hint}` : isKo ? "퀵스타트에 실패했습니다" : "Quickstart failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function seedDemoData() {
    setSeeding(true);
    setReportError(null);
    setInfoMessage(null);
    try {
      await apiFetch<{ ok: boolean; seeded_days: number }>("/demo/seed", {
        method: "POST",
        body: JSON.stringify({ reset: true, days: 7, include_reports: false }),
      });
      await Promise.all([loadTodayLog(), loadConsistency(), loadReport(), loadCohortTrend()]);
      setInfoMessage(t.seedDone);
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setReportError(err instanceof Error ? `${err.message}${hint}` : (isKo ? "데모 시드 생성에 실패했습니다" : "Failed to seed demo data"));
    } finally {
      setSeeding(false);
    }
  }

  async function loadConsistency() {
    if (isE2ETestMode()) {
      setConsistency({
        score: 0,
        series: [
          { day: "02-01", blocks: 0 },
          { day: "02-02", blocks: 0 },
          { day: "02-03", blocks: 0 },
          { day: "02-04", blocks: 0 },
          { day: "02-05", blocks: 0 },
          { day: "02-06", blocks: 0 },
          { day: "02-07", blocks: 0 },
        ],
      });
      setWeekly({ daysLogged: 0, daysTotal: 7, totalBlocks: 0, deepMinutes: 0, goal: null });
      return;
    }
    try {
      const start = new Date();
      start.setDate(start.getDate() - 6);
      const from = localYYYYMMDD(start);

      const res = await apiFetch<WeeklyInsightsResponse>(`/insights/weekly?from=${from}&to=${today}`);
      setConsistency({
        score: Math.max(0, Math.min(100, Math.round(Number(res.consistency.score) || 0))),
        series: Array.isArray(res.consistency.series)
          ? res.consistency.series.map((s) => ({
              day: String(s.day || "").slice(0, 5),
              blocks: Number.isFinite(Number(s.blocks)) ? Number(s.blocks) : 0,
            }))
          : [],
      });

      const goal: GoalPrefs | null =
        res.weekly.goal && typeof res.weekly.goal.keyword === "string"
          ? {
              keyword: res.weekly.goal.keyword,
              minutesPerDay: Number.isFinite(Number(res.weekly.goal.minutes_per_day))
                ? Math.round(Number(res.weekly.goal.minutes_per_day))
                : 0,
            }
          : null;

      setWeekly({
        daysLogged: Number.isFinite(Number(res.weekly.days_logged)) ? Number(res.weekly.days_logged) : 0,
        daysTotal: Number.isFinite(Number(res.weekly.days_total)) ? Number(res.weekly.days_total) : 0,
        totalBlocks: Number.isFinite(Number(res.weekly.total_blocks)) ? Number(res.weekly.total_blocks) : 0,
        deepMinutes: Number.isFinite(Number(res.weekly.deep_minutes)) ? Number(res.weekly.deep_minutes) : 0,
        goal: goal && goal.minutesPerDay > 0 ? goal : null,
      });
    } catch {
      setConsistency({ score: 0, series: [] });
      setWeekly({ daysLogged: 0, daysTotal: 7, totalBlocks: 0, deepMinutes: 0, goal: null });
    }
  }

  async function loadCohortTrend() {
    setCohortLoading(true);
    try {
      const res = await apiFetch<CohortTrend>("/trends/cohort");
      setCohortTrend(res);
    } catch {
      setCohortTrend(null);
    } finally {
      setCohortLoading(false);
    }
  }

  React.useEffect(() => {
    void Promise.all([loadReport(), loadConsistency(), loadTodayLog(), loadCohortTrend()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasLog = todayLogBlocks > 0;
  const hasReport = Boolean(report);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div>
        <h1 className="title-serif text-3xl">{t.title}</h1>
        <p className="mt-1 text-sm text-mutedFg">{t.subtitle}</p>
        <p className="mt-2 text-xs text-mutedFg">
          {t.todayLabel}: <span className="font-mono">{today}</span>
        </p>
      </div>

      {reportError ? (
        <div className="whitespace-pre-line rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {reportError}
        </div>
      ) : null}
      {infoMessage ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          {infoMessage}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>{t.coachTitle}</CardTitle>
            <CardDescription>{t.coachDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {reportLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex gap-2 pt-2">
                  <Skeleton className="h-9 w-24 rounded-md" />
                  <Skeleton className="h-9 w-24 rounded-md" />
                </div>
              </div>
            ) : report ? (
              <div className="space-y-3">
                <p className="title-serif text-2xl leading-snug">{report.coach_one_liner}</p>
                <p className="text-sm text-mutedFg">{report.summary}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/app/reports/${today}`}>{t.cta_openReport}</Link>
                  </Button>
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/app/daily-flow">{t.cta_editLog}</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border bg-white/55 p-4">
                <p className="text-sm font-semibold">{t.coachEmptyTitle}</p>
                <p className="text-sm text-mutedFg">{hasLog ? t.coachEmptyBody_hasLog : t.coachEmptyBody_noLog}</p>
                <p className="text-xs text-mutedFg">{t.coachEmptyHint}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5 border-brand/30 bg-white/70 shadow-soft">
          <CardHeader>
            <CardTitle>{t.nextTitle}</CardTitle>
            <CardDescription>
              {!hasLog ? t.nextDesc_noLog : !hasReport ? t.nextDesc_noReport : t.nextDesc_hasReport}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-xl border bg-white/60 p-3">
                <p className="text-xs text-mutedFg">{t.progress}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg border bg-white/70 p-2 text-center">
                    <div className="font-semibold">{t.step_log}</div>
                    <div className={hasLog ? "mt-1 text-emerald-700" : "mt-1 text-mutedFg"}>
                      {hasLog ? (isKo ? "완료" : "OK") : "—"}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-white/70 p-2 text-center">
                    <div className="font-semibold">{t.step_analyze}</div>
                    <div className={hasReport ? "mt-1 text-emerald-700" : "mt-1 text-mutedFg"}>
                      {hasReport ? (isKo ? "완료" : "OK") : "—"}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-white/70 p-2 text-center">
                    <div className="font-semibold">{t.step_plan}</div>
                    <div className={hasReport ? "mt-1 text-emerald-700" : "mt-1 text-mutedFg"}>
                      {hasReport ? (isKo ? "완료" : "OK") : "—"}
                    </div>
                  </div>
                </div>
              </div>

              {!hasLog ? (
                <div className="flex flex-col gap-2">
                  <Button onClick={quickstart} disabled={analyzing}>
                    <Sparkles className="h-4 w-4" />
                    {analyzing ? t.analyzing : t.cta_start3min}
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/app/daily-flow?template=${encodeURIComponent(DEFAULT_TEMPLATE_NAME)}&quickstart=1`}>
                      {t.cta_editLog}
                    </Link>
                  </Button>
                </div>
              ) : !hasReport ? (
                <div className="flex flex-col gap-2">
                  <Button onClick={analyze} disabled={analyzing}>
                    <Sparkles className="h-4 w-4" />
                    {analyzing ? t.analyzing : t.cta_analyzeNow}
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/app/daily-flow">{t.cta_editLog}</Link>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button asChild disabled={analyzing}>
                    <Link href={`/app/reports/${today}`}>{t.cta_viewTomorrow}</Link>
                  </Button>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={analyze} disabled={analyzing}>
                      <Sparkles className="h-4 w-4" />
                      {analyzing ? t.analyzing : t.cta_analyzeNow}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={loadReport} disabled={reportLoading}>
                      {t.cta_reload}
                    </Button>
                  </div>
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={seedDemoData} disabled={seeding || analyzing}>
                {seeding ? t.cta_seeding : t.cta_seedDemo}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader>
            <CardTitle>{t.tomorrowSchedule}</CardTitle>
            <CardDescription>{t.tomorrowScheduleDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {reportLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            ) : report?.tomorrow_routine?.length ? (
              <div className="space-y-3">
                {report.tomorrow_routine.slice(0, 6).map((it, idx) => (
                  <div key={idx} className="rounded-lg border bg-white/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">
                        {it.start}–{it.end} · {it.activity}
                      </p>
                      <span className="rounded-full border bg-white/70 px-2 py-1 text-[11px] text-mutedFg">
                        {isKo ? "목표" : "Goal"}: {it.goal}
                      </span>
                    </div>
                  </div>
                ))}
                {report.tomorrow_routine.length > 6 ? (
                  <p className="text-xs text-mutedFg">{t.moreBlocks(report.tomorrow_routine.length - 6)}</p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border bg-white/55 p-4">
                <p className="text-sm font-semibold">{t.scheduleEmptyTitle}</p>
                <p className="mt-1 text-sm text-mutedFg">{t.scheduleEmptyBody}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader>
            <CardTitle>{isKo ? "나와 유사한 사용자 트렌드" : "Similar Users Trend"}</CardTitle>
            <CardDescription>
              {isKo
                ? "옵트인한 사용자의 익명 집계입니다. 비교 기준은 설정에서 조정할 수 있습니다."
                : "Anonymized aggregate from opted-in users. You can tune comparison dimensions in Preferences."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cohortLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ) : !cohortTrend ? (
              <div className="rounded-lg border bg-white/55 p-4">
                <p className="text-sm">
                  {isKo ? "코호트 트렌드를 불러오지 못했습니다." : "Failed to load cohort trend."}
                </p>
              </div>
            ) : !cohortTrend.enabled ? (
              <div className="rounded-lg border bg-white/55 p-4">
                <p className="text-sm">{cohortTrend.message}</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/app/preferences">{isKo ? "설정 열기" : "Open Preferences"}</Link>
                </Button>
              </div>
            ) : cohortTrend.insufficient_sample ? (
              <div className="rounded-lg border bg-white/55 p-4">
                <p className="text-sm">{cohortTrend.message}</p>
                <p className="mt-1 text-xs text-mutedFg">
                  {isKo
                    ? `현재 표본 ${cohortTrend.cohort_size}명 / 최소 ${cohortTrend.min_sample_size}명`
                    : `Current sample ${cohortTrend.cohort_size} / minimum ${cohortTrend.min_sample_size}`}
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/app/preferences">{isKo ? "비교 기준 조정" : "Adjust filters"}</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm">{cohortTrend.message}</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border bg-white/50 p-3">
                    <p className="text-xs text-mutedFg">{isKo ? "집중 블록 유지율" : "Focus-window consistency"}</p>
                    <p className="title-serif mt-1 text-2xl">{cohortTrend.metrics.focus_window_rate ?? 0}%</p>
                    <p className="mt-1 text-[11px] text-mutedFg">
                      n={cohortTrend.metrics.focus_window_numerator}/{cohortTrend.metrics.focus_window_denominator}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-white/50 p-3">
                    <p className="text-xs text-mutedFg">{isKo ? "집중 붕괴 후 복귀율" : "Rebound rate after drop"}</p>
                    <p className="title-serif mt-1 text-2xl">{cohortTrend.metrics.rebound_rate ?? 0}%</p>
                    <p className="mt-1 text-[11px] text-mutedFg">
                      n={cohortTrend.metrics.rebound_numerator}/{cohortTrend.metrics.rebound_denominator}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-white/50 p-3">
                    <p className="text-xs text-mutedFg">{isKo ? "회복 버퍼 사용일 비율" : "Recovery-buffer day rate"}</p>
                    <p className="title-serif mt-1 text-2xl">{cohortTrend.metrics.recovery_buffer_day_rate ?? 0}%</p>
                    <p className="mt-1 text-[11px] text-mutedFg">
                      n={cohortTrend.metrics.recovery_day_numerator}/{cohortTrend.metrics.recovery_day_denominator}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border bg-white/70 px-2 py-1 text-[11px] text-mutedFg">
                    {isKo ? `코호트 ${cohortTrend.cohort_size}명` : `${cohortTrend.cohort_size} users`}
                  </span>
                  <span className="rounded-full border bg-white/70 px-2 py-1 text-[11px] text-mutedFg">
                    {isKo ? `${cohortTrend.window_days}일 기준` : `${cohortTrend.window_days}-day window`}
                  </span>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/app/preferences">{isKo ? "비교 기준 변경" : "Change dimensions"}</Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader>
            <CardTitle>{t.peakHours}</CardTitle>
            <CardDescription>{t.peakHoursDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {reportLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
            ) : report?.productivity_peaks?.length ? (
              <div className="space-y-3">
                {report.productivity_peaks.slice(0, 4).map((p, idx) => (
                  <div key={idx} className="rounded-lg border bg-white/50 p-3">
                    <p className="text-sm font-semibold">
                      {p.start}–{p.end}
                    </p>
                    <p className="mt-1 text-xs text-mutedFg">{p.reason}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border bg-white/55 p-4">
                <p className="text-sm text-mutedFg">{t.peakHoursEmpty}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader>
            <CardTitle>{t.breakTriggers}</CardTitle>
            <CardDescription>{t.breakTriggersDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {reportLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-lg" />
              </div>
            ) : report?.failure_patterns?.length ? (
              <div className="space-y-3">
                {report.failure_patterns.slice(0, 3).map((f, idx) => (
                  <div key={idx} className="rounded-lg border bg-white/50 p-3">
                    <p className="text-sm font-semibold">{f.pattern}</p>
                    <p className="mt-1 text-xs text-mutedFg">
                      {isKo ? "트리거" : "Trigger"}: {f.trigger}
                    </p>
                    <p className="mt-1 text-xs text-mutedFg">
                      {t.fixLabel}: {f.fix}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border bg-white/55 p-4">
                <p className="text-sm text-mutedFg">{t.breakTriggersEmpty}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <details className="group rounded-2xl border bg-white/55 p-4 shadow-soft">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{t.detailsTitle}</p>
              <p className="mt-1 text-xs text-mutedFg">{t.detailsSubtitle}</p>
            </div>
            <span className="rounded-full border bg-white/70 px-3 py-1 text-xs text-mutedFg group-open:hidden">
              {isKo ? "열기" : "Open"}
            </span>
            <span className="rounded-full border bg-white/70 px-3 py-1 text-xs text-mutedFg hidden group-open:inline-flex">
              {isKo ? "닫기" : "Close"}
            </span>
          </div>
        </summary>

        <div className="mt-4 grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-12">
            <CardHeader>
              <CardTitle>{t.consistency}</CardTitle>
              <CardDescription>{t.consistencyDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between">
                <p className="title-serif text-4xl">{consistency.score}</p>
                <p className="text-sm text-mutedFg">/ 100</p>
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-white/50 p-3 text-sm">
                <span className="text-mutedFg">{t.daysLogged}</span>
                <span className="font-semibold">
                  {weekly.daysLogged}/{weekly.daysTotal}
                </span>
              </div>
              <div className="h-32 rounded-lg border bg-white/40 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={consistency.series}>
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="rgba(0,0,0,0.35)" />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                      contentStyle={{ borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)" }}
                    />
                    <Bar dataKey="blocks" fill="rgba(168,132,98,0.75)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadWeeklyShareCard({
                      score: consistency.score,
                      daysLogged: weekly.daysLogged,
                      daysTotal: weekly.daysTotal || 7,
                      totalBlocks: weekly.totalBlocks,
                      deepMinutes: weekly.deepMinutes,
                      goalMinutesPerDay: weekly.goal?.minutesPerDay,
                      goalKeyword: weekly.goal?.keyword
                    })
                  }
                  disabled={!weekly.daysTotal}
                >
                  {t.downloadShare}
                </Button>
                <p className="text-xs text-mutedFg">{t.tip}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t.weeklyTitle}</CardTitle>
              <CardDescription>{t.weeklyDesc}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border bg-white/50 p-4">
                <p className="text-xs text-mutedFg">{t.totalBlocks7d}</p>
                <p className="title-serif mt-1 text-3xl">{weekly.totalBlocks}</p>
              </div>
              <div className="rounded-xl border bg-white/50 p-4">
                <p className="text-xs text-mutedFg">{t.deepMinutes7d}</p>
                <p className="title-serif mt-1 text-3xl">{weekly.deepMinutes}</p>
              </div>
              <div className="rounded-xl border bg-white/50 p-4">
                {weekly.daysLogged === 0 ? (
                  <>
                    <p className="text-xs text-mutedFg">{t.emptyMetricsTitle}</p>
                    <p className="mt-2 text-sm">{t.emptyMetricsBody}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <Link href="/app/daily-flow">{t.cta_editLog}</Link>
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-mutedFg">{t.nextTitle}</p>
                    <p className="mt-2 text-sm">
                      {isKo
                        ? "무너지는 구간에 10분 버퍼를 넣고, 내일 다시 분석해 계획을 개선해보세요."
                        : "Add a 10-min buffer where you break, then re-run Analyze tomorrow to improve the plan."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <Link href="/app/daily-flow">{t.cta_editLog}</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/app/reports/${today}`}>{t.cta_openReport}</Link>
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </details>
    </div>
  );
}
