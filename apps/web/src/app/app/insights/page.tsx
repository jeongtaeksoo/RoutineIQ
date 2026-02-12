"use client";

import * as React from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sparkles } from "lucide-react";
import Link from "next/link";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, isApiFetchError } from "@/lib/api-client";
import { DAILY_FLOW_TEMPLATES, DEFAULT_TEMPLATE_NAME } from "@/lib/daily-flow-templates";
import { downloadWeeklyShareCard } from "@/lib/share-card";
import { createClient } from "@/lib/supabase/client";

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

  const [analyzing, setAnalyzing] = React.useState(false);
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
    try {
      const res = await apiFetch<{ date: string; report: AIReport; cached: boolean }>(`/analyze`, {
        method: "POST",
        body: JSON.stringify({ date: today })
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
        body: JSON.stringify({ date: today })
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

  async function loadConsistency() {
    const supabase = createClient();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const startStr = localYYYYMMDD(start);

    // Preferences from user metadata (cross-device; avoids localStorage).
    let goal: GoalPrefs | null = null;
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const meta = (user?.user_metadata as any) || {};
      const g = meta["routineiq_goal_v1"];
      if (g && typeof g === "object") {
        const kw = typeof (g as any).keyword === "string" ? String((g as any).keyword) : "";
        const mpd = Number((g as any).minutesPerDay);
        if (kw.trim() && Number.isFinite(mpd) && mpd > 0) {
          goal = { keyword: kw.trim(), minutesPerDay: Math.round(mpd) };
        }
      }
    } catch {
      // ignore
    }

    // Cumulative consistency (so first day can be 100%).
    const earliest = await supabase.from("activity_logs").select("date").order("date", { ascending: true }).limit(1).maybeSingle();
    const earliestDate = earliest.data?.date ? String(earliest.data.date) : null;
    let daysTotal = 0;
    if (earliestDate) {
      const [ey, em, ed] = earliestDate.split("-").map((x) => Number(x));
      const eDt = new Date(ey, (em || 1) - 1, ed || 1);
      const [ty, tm, td] = today.split("-").map((x) => Number(x));
      const tDt = new Date(ty, (tm || 1) - 1, td || 1);
      const diffDays = Math.floor((tDt.getTime() - eDt.getTime()) / (1000 * 60 * 60 * 24));
      daysTotal = Math.max(1, diffDays + 1);
    }

    const countRes = await supabase
      .from("activity_logs")
      .select("id", { count: "exact", head: true })
      .lte("date", today);
    const daysLogged = Math.max(0, countRes.count || 0);

    const { data, error } = await supabase
      .from("activity_logs")
      .select("date,entries")
      .gte("date", startStr)
      .lte("date", today)
      .order("date", { ascending: true });

    if (error) return;

    const series =
      (data || []).map((r: any) => {
        const entries = Array.isArray(r.entries) ? (r.entries as any[]) : [];
        const blocks = entries.length;

        let energySum = 0;
        let energyN = 0;
        let focusSum = 0;
        let focusN = 0;
        let deepMinutes = 0;

        for (const e of entries) {
          const energy = typeof e.energy === "number" ? e.energy : null;
          const focus = typeof e.focus === "number" ? e.focus : null;
          if (energy != null) {
            energySum += energy;
            energyN += 1;
          }
          if (focus != null) {
            focusSum += focus;
            focusN += 1;
          }
          if (goal?.keyword) {
            const act = typeof e.activity === "string" ? e.activity : "";
            const tags = Array.isArray(e.tags) ? e.tags.join(" ") : "";
            const hay = `${act} ${tags}`.toLowerCase();
            if (hay.includes(goal.keyword.toLowerCase())) {
              const s = typeof e.start === "string" ? e.start : "";
              const en = typeof e.end === "string" ? e.end : "";
              const m1 = /^(\d{2}):(\d{2})$/.exec(s);
              const m2 = /^(\d{2}):(\d{2})$/.exec(en);
              if (m1 && m2) {
                const sm = Number(m1[1]) * 60 + Number(m1[2]);
                const em = Number(m2[1]) * 60 + Number(m2[2]);
                if (Number.isFinite(sm) && Number.isFinite(em) && em > sm) deepMinutes += em - sm;
              }
            }
          }
        }

        return {
          day: String(r.date).slice(5),
          blocks,
          avgEnergy: energyN ? Math.round((energySum / energyN) * 10) / 10 : null,
          avgFocus: focusN ? Math.round((focusSum / focusN) * 10) / 10 : null,
          deepMinutes
        };
      }) || [];

    // Fill missing days for a stable chart.
    const byDay = new Map(series.map((s) => [s.day, s]));
    const filled: { day: string; blocks: number; avgEnergy: number | null; avgFocus: number | null; deepMinutes: number }[] = [];
    const cursor = new Date(start);
    for (let i = 0; i < 7; i++) {
      const key = localYYYYMMDD(cursor).slice(5);
      const row = byDay.get(key);
      filled.push({
        day: key,
        blocks: row?.blocks ?? 0,
        avgEnergy: row?.avgEnergy ?? null,
        avgFocus: row?.avgFocus ?? null,
        deepMinutes: row?.deepMinutes ?? 0
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const denom = daysTotal || 7;
    const score = denom > 0 ? Math.round((daysLogged / denom) * 100) : 0;
    setConsistency({ score: Math.max(0, Math.min(100, score)), series: filled.map((x) => ({ day: x.day, blocks: x.blocks })) });

    const totalBlocks = filled.reduce((acc, x) => acc + x.blocks, 0);
    const deepMinutes = filled.reduce((acc, x) => acc + x.deepMinutes, 0);
    setWeekly({
      daysLogged,
      daysTotal: denom,
      totalBlocks,
      deepMinutes,
      goal
    });
  }

  React.useEffect(() => {
    void Promise.all([loadReport(), loadConsistency(), loadTodayLog()]);
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

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>{t.coachTitle}</CardTitle>
            <CardDescription>{t.coachDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {reportLoading ? (
              <p className="text-sm text-mutedFg">{t.loading}</p>
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
              <p className="text-sm text-mutedFg">{t.loading}</p>
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

        <Card className="lg:col-span-6">
          <CardHeader>
            <CardTitle>{t.peakHours}</CardTitle>
            <CardDescription>{t.peakHoursDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {reportLoading ? (
              <p className="text-sm text-mutedFg">{t.loading}</p>
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
              <p className="text-sm text-mutedFg">{t.loading}</p>
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
