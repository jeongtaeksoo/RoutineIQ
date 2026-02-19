"use client";

import * as React from "react";
import { Sparkles, FileText, Clock, AlertTriangle, CheckCircle2, ShieldCheck, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, isApiFetchError } from "@/lib/api-client";
import { DAILY_FLOW_TEMPLATES, DEFAULT_TEMPLATE_NAME } from "@/lib/daily-flow-templates";
import { localYYYYMMDD } from "@/lib/date-utils";
import { type AIReport, normalizeReport } from "@/lib/report-utils";
import { isE2ETestMode } from "@/lib/supabase/env";



type WeeklyInsightsResponse = {
  from_date: string;
  to_date: string;
  weekly: {
    days_logged: number;
    days_total: number;
    total_blocks: number;
    deep_minutes: number;
  } & Record<string, unknown>;
  streak?: {
    current: number;
    longest: number;
  };
  trend?: Record<string, unknown>;
};

type CohortTrend = {
  enabled: boolean;
  insufficient_sample: boolean;
  min_sample_size: number;
  preview_sample_size: number;
  high_confidence_sample_size: number;
  threshold_variant: "control" | "candidate" | string;
  preview_mode: boolean;
  confidence_level: "low" | "medium" | "high" | string;
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
  my_focus_rate: number | null;
  my_rebound_rate: number | null;
  my_recovery_rate: number | null;
  my_focus_delta_7d: number | null;
  my_rebound_delta_7d: number | null;
  my_recovery_delta_7d: number | null;
  rank_label: string;
  actionable_tip: string;
};

type RecoveryActive = {
  has_open_session: boolean;
  session_id?: string;
  lapse_start_ts?: string;
  elapsed_min?: number | null;
  correlation_id?: string;
};

type RecoveryNudgePayload = {
  nudge_id: string;
  session_id: string;
  message: string;
  lapse_start_ts: string;
  created_at: string;
  correlation_id: string;
};

type RecoveryNudgeEnvelope = {
  has_nudge: boolean;
  nudge?: RecoveryNudgePayload | null;
  correlation_id?: string;
};

const ROUTINE_ACTIVITY_RENAME_KO: Record<string, string> = {
  "핵심 집중 블록": "집중 작업 시간",
  "회복 버퍼": "쉬는 시간",
  "조정/커뮤니케이션 블록": "소통·정리 시간",
};

const ROUTINE_ACTIVITY_RENAME_EN: Record<string, string> = {
  "Deep focus block": "Focused work session",
  "Recovery buffer": "Recovery break",
  "Coordination/communication block": "Coordination time",
};

function normalizeRoutineActivityLabel(activity: string, isKo: boolean): string {
  const clean = activity.trim();
  if (!clean) return activity;
  if (isKo) {
    return ROUTINE_ACTIVITY_RENAME_KO[clean] ?? clean;
  }
  return ROUTINE_ACTIVITY_RENAME_EN[clean] ?? clean;
}



const INSIGHTS_REPORT_CACHE_TTL_MS = 1000 * 60 * 5;

function insightsReportCacheKey(date: string, locale: string): string {
  return `routineiq:insights-report:v1:${date}:${locale}`;
}

function readCachedInsightsReport(date: string, locale: string): AIReport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(insightsReportCacheKey(date, locale));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts?: number; report?: AIReport };
    if (!parsed?.ts || !parsed?.report) return null;
    if (Date.now() - parsed.ts > INSIGHTS_REPORT_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(insightsReportCacheKey(date, locale));
      return null;
    }
    return parsed.report;
  } catch {
    return null;
  }
}

function writeCachedInsightsReport(date: string, locale: string, report: AIReport): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      insightsReportCacheKey(date, locale),
      JSON.stringify({ ts: Date.now(), report })
    );
  } catch {
    // Ignore cache storage failures.
  }
}

function clearCachedInsightsReport(date: string, locale: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(insightsReportCacheKey(date, locale));
  } catch {
    // Ignore cache removal failures.
  }
}



export default function InsightsPage() {
  const locale = useLocale();
  const isKo = locale === "ko";

  const t = React.useMemo(() => {
    if (isKo) {
      return {
        title: "나의 하루",
        subtitle: "하루를 기록하고 내일을 준비해요.",
        todayLabel: "오늘",
        coachTitle: "오늘의 한 마디",
        coachDesc: "기록을 바탕으로 지금 할 행동 1개를 알려줘요.",
        coreSentenceTitle: "오늘의 핵심 문장",
        reasonTitle: "이유",
        reasonEmpty: "오늘 기록이 쌓이면 이유를 함께 보여드릴게요.",
        oneActionTitle: "지금 할 한 가지",
        oneActionEmpty: "추천 행동이 아직 없어요.",
        weeklyPatternLabel: "주간 패턴",
        microAdviceLabel: "5분 실행",
        coachEmptyTitle: "아직 오늘 리포트가 없어요",
        coachEmptyBody_noLog: "오늘 기록을 남기면 코칭이 생성돼요.",
        coachEmptyBody_hasLog: "기록 완료! '정리하기'를 누르면 코칭이 나와요.",
        coachEmptyHint: "'다음 단계' 카드에서 바로 진행할 수 있어요.",
        nextTitle: "다음 단계",
        nextDesc_noLog: "기록이 없어요. 3줄만 적으면 분석을 시작할 수 있어요.",
        nextDesc_noReport: "기록이 저장되어 있어요. ‘AI로 정리하기’를 누르면 리포트에서 확인할 수 있어요.",
        nextDesc_hasReport: "내일 일정을 미리 보고 여유를 챙겨보세요.",
        cta_start3min: "3분 만에 시작하기",
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
        tomorrowScheduleDesc: "핵심 블록만 먼저 확인하고, 자세한 내용은 리포트에서 보세요.",
        scheduleEmptyTitle: "분석을 실행하면 내일 계획이 생성돼요",
        scheduleEmptyBody: "시간표와 복구 규칙이 여기에 표시돼요.",
        moreBlocks: (n: number) => `+ ${n}개 더 보기`,
        coachTip: "오늘의 팁",
        coachTipDesc: "부담 없이 실천할 수 있는 한 줄.",
        profileSetupTitle: "프로필을 완성하면 추천이 더 정확해져요",
        profileSetupBody: "연령대·성별·직군·근무 형태를 설정하면 더 맞춤 추천을 받아요.",
        profileSetupCta: "설정 열기",
        peakHours: "집중 잘 되는 시간",
        peakHoursDesc: "집중이 자연스럽게 일어나는 시간대입니다.",
        peakHoursEmpty: "분석을 실행하면 집중 잘 되는 시간대가 표시돼요.",
        breakTriggers: "집중을 방해하는 것들",
        breakTriggersDesc: "나도 모르게 흐름이 끊기는 순간들.",
        breakTriggersEmpty: "분석을 실행하면 흐름을 깨는 패턴이 표시돼요.",
        fixLabel: "해결안",
        consistency: "기록 점수",
        consistencyDesc: "최근 7일간 기록한 날들이에요.",
        daysLogged: "기록한 날",
        downloadShare: "기록 공유하기",
        tip: "팁: 매일 조금씩 기록하면, 나에게 더 잘 맞는 제안을 받을 수 있어요.",
        weeklyTitle: "이번 주 요약",
        weeklyDesc: "지난 7일간의 나의 모습입니다.",
        weeklySimpleTitle: "주간 요약",
        weeklySimpleDesc: "핵심 3가지만 간단히 확인하세요.",
        avgFocusTime: "평균 집중 시간",
        commonFailurePattern: "가장 흔한 방해 패턴",
        noPattern: "아직 충분한 패턴이 없어요",
        totalBlocks7d: "기록한 활동 수",
        deepMinutes7d: "집중한 시간 (7일)",
        currentStreak: "연속 기록",
        longestStreak: "최장 연속 기록",
        trendPattern: "주간 변화",
        trendBlocksDelta: "활동 수 변화",
        trendDeepDelta: "집중 시간 변화",
        weeklyNoteTitle: "이번 주 메모",
        weeklyNoteEmpty: "데이터가 쌓이면 이곳에 다음 액션이 자동으로 제안됩니다.",
        weeklyNoteActive: "가장 자주 흐름이 끊긴 구간에 10분 여유 시간을 먼저 넣어보세요.",
        emptyMetricsTitle: "데이터가 쌓이고 있어요",
        emptyMetricsBody: "오늘 첫 기록을 남겨보세요. 3일만 쌓여도 내 패턴이 보이기 시작합니다.",
        detailsTitle: "이번 주 한눈에 보기",
        detailsSubtitle: "기록 점수와 주간 요약",
        cohortTitle: "나와 유사한 사용자 트렌드",
        cohortDesc: "동의한 사용자의 익명 비교예요. 비교 기준은 설정에서 바꿀 수 있어요.",
        youVsSimilar: "나 vs 유사 사용자",
        similarUsers: (n: number) => `유사 사용자 ${n}명`,
        myFocusRate: "나의 집중 블록 유지율",
        myReboundRate: "나의 복귀율",
        myRecoveryRate: "나의 회복 시간 활용일",
        average: "유사 사용자 평균",
        rank: "나의 위치",
        actionableTip: "실행 팁",
        confidence: "데이터 정확도",
        confidenceLow: "낮음",
        confidenceMedium: "보통",
        confidenceHigh: "충분",
        previewOnly: "참고용 미리보기",
        compareBy: "비교 기준",
        trendVsLastWeek: "전주 대비",
        noPrevWeek: "전주 데이터 없음",
        dim_age_group: "연령대",
        dim_gender: "성별",
        dim_job_family: "직군",
        dim_work_mode: "근무 형태",
        trustBadge: "AI 참고 안내",
        trustBadgeBody: "기록 기반 추정이에요. 전문 진단은 아니며, 기록이 쌓일수록 정확해져요.",
        recoveryTitle: "다시 시작해볼까요?",
        recoveryBody: "기록이 며칠 비었어요. 한 줄만 적어도 다시 시작할 수 있어요.",
        recoveryCta: "오늘 기록 다시 시작",
        nudgeTitle: "복구 알림",
        nudgeDismiss: "확인",
        cohortSampleLine: (n: number, w: number) => `표본 ${n}명 · ${w}일 기준`,
        errorLoad: "리포트를 불러오지 못했어요",
        errorAnalyze: "분석에 실패했어요",
        errorQuickstart: "퀵스타트에 실패했어요",
        statusDone: "완료",
        labelGoal: "실행 포인트",
        errorCohort: "유사 사용자 트렌드를 불러오지 못했어요.",
        openSettings: "설정 열기",
        adjustCompare: "비교 기준 조정",
        labelMe: "나",
        changeCompare: "비교 기준 변경",
        labelOpen: "열기",
        labelClose: "닫기",
      };
    }
    return {
      title: "My Insights",
      subtitle: "Log → Analyze → Tomorrow plan. Follow one next action.",
      todayLabel: "Today",
      coachTitle: "One-line Coaching",
      coachDesc: "Based on your log, we suggest one action you can do now.",
      coreSentenceTitle: "Today’s core sentence",
      reasonTitle: "Why",
      reasonEmpty: "We’ll explain the reason once enough daily signals are available.",
      oneActionTitle: "Do this now",
      oneActionEmpty: "No immediate action yet.",
      weeklyPatternLabel: "Weekly pattern",
      microAdviceLabel: "5-min action",
      coachEmptyTitle: "No report for today yet",
      coachEmptyBody_noLog: "Start with today's Daily Flow log to generate your one-line coaching.",
      coachEmptyBody_hasLog: "Your log is ready. Run Analyze to generate today's one-line coaching.",
      coachEmptyHint: "Use the Next Action card on the right to continue.",
      nextTitle: "Next Action",
      nextDesc_noLog: "No log yet. A short 3-line diary is enough to start your first analysis.",
      nextDesc_noReport: "Your log is saved. Tap Analyze to generate a full report.",
      nextDesc_hasReport: "Review tomorrow’s plan and add buffers where you usually break.",
      cta_start3min: "Start 3-min check",
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
      tomorrowScheduleDesc: "See only key blocks here. Open the report for full details.",
      scheduleEmptyTitle: "Run Analyze to generate tomorrow's plan",
      scheduleEmptyBody: "Your timeline and recovery rules will appear here.",
      moreBlocks: (n: number) => `+ ${n} more blocks`,
      coachTip: "Coach Tip of the Day",
      coachTipDesc: "One actionable sentence, no fluff.",
      profileSetupTitle: "Complete your profile to improve personalization",
      profileSetupBody: "Age, gender, job family, and work mode make tomorrow plans more realistic.",
      profileSetupCta: "Open preferences",
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
      weeklySimpleTitle: "Weekly summary",
      weeklySimpleDesc: "Keep it simple with 3 key indicators.",
      avgFocusTime: "Average focus time",
      commonFailurePattern: "Most common blocker",
      noPattern: "Not enough pattern data yet",
      totalBlocks7d: "Total blocks (7d)",
      deepMinutes7d: "Deep Work Minutes (7d)",
      currentStreak: "Current streak",
      longestStreak: "Longest streak",
      trendPattern: "Weekly pattern",
      trendBlocksDelta: "Blocks delta",
      trendDeepDelta: "Deep-work delta",
      weeklyNoteTitle: "Weekly note",
      weeklyNoteEmpty: "As data accumulates, the next best action will be suggested here.",
      weeklyNoteActive: "Add a 10-minute buffer to the block where your flow breaks most often.",
      emptyMetricsTitle: "Building your baseline",
      emptyMetricsBody: "Your first log starts the score. After 3 days, patterns show up fast.",
      detailsTitle: "More weekly metrics",
      detailsSubtitle: "Consistency chart and weekly snapshot",
      cohortTitle: "Similar Users Trend",
      cohortDesc: "Anonymized aggregate from opted-in users. You can tune comparison dimensions in Preferences.",
      youVsSimilar: "You vs Similar Users",
      similarUsers: (n: number) => `${n} similar users`,
      myFocusRate: "My focus-window rate",
      myReboundRate: "My rebound rate",
      myRecoveryRate: "My recovery-buffer days",
      average: "Average",
      rank: "Your rank",
      actionableTip: "Actionable tip",
      confidence: "Data confidence",
      confidenceLow: "Low",
      confidenceMedium: "Moderate",
      confidenceHigh: "High",
      previewOnly: "Preview only",
      compareBy: "Compared by",
      trendVsLastWeek: "vs last week",
      noPrevWeek: "No prior-week data",
      dim_age_group: "Age group",
      dim_gender: "Gender",
      dim_job_family: "Job family",
      dim_work_mode: "Work mode",
      trustBadge: "AI Notice",
      trustBadgeBody: "These insights are estimates based on your logged data, not professional advice. Accuracy improves as you log more days.",
      recoveryTitle: "Ready to pick back up?",
      recoveryBody: "Your log streak has a gap. Even one line is enough to restart your flow.",
      recoveryCta: "Restart today\'s log",
      nudgeTitle: "Recovery nudge",
      nudgeDismiss: "Dismiss",
      cohortSampleLine: (n: number, w: number) => `Sample ${n} users \u00b7 ${w}-day window`,
      errorLoad: "Failed to load report",
      errorAnalyze: "Analyze failed",
      errorQuickstart: "Quickstart failed",
      statusDone: "OK",
      labelGoal: "Action guide",
      errorCohort: "Failed to load cohort trend.",
      openSettings: "Open Preferences",
      adjustCompare: "Adjust filters",
      labelMe: "You",
      changeCompare: "Change dimensions",
      labelOpen: "Open",
      labelClose: "Close",
    };
  }, [isKo]);

  const today = React.useMemo(() => localYYYYMMDD(), []);
  const [report, setReport] = React.useState<AIReport | null>(null);
  const [reportLoading, setReportLoading] = React.useState(true);
  const [reportError, setReportError] = React.useState<string | null>(null);
  const [infoMessage, setInfoMessage] = React.useState<string | null>(null);

  const [analyzing, setAnalyzing] = React.useState(false);
  const [todayLogBlocks, setTodayLogBlocks] = React.useState<number>(0);

  const [weekly, setWeekly] = React.useState<{
    daysLogged: number;
    daysTotal: number;
    totalBlocks: number;
    deepMinutes: number;
  }>({ daysLogged: 0, daysTotal: 0, totalBlocks: 0, deepMinutes: 0 });
  const [streak, setStreak] = React.useState<{ current: number; longest: number }>({ current: 0, longest: 0 });
  const [metricsLoading, setMetricsLoading] = React.useState(true);
  const [cohortTrend, setCohortTrend] = React.useState<CohortTrend | null>(null);
  const [cohortLoading, setCohortLoading] = React.useState(true);
  const [profileMissingRequired, setProfileMissingRequired] = React.useState(false);
  const [recoveryActive, setRecoveryActive] = React.useState<RecoveryActive | null>(null);
  const [recoveryNudge, setRecoveryNudge] = React.useState<RecoveryNudgePayload | null>(null);
  const [nudgeAcking, setNudgeAcking] = React.useState(false);

  async function loadTodayLog(): Promise<boolean> {
    try {
      const res = await apiFetch<{ date: string; entries: unknown[]; note: string | null }>(`/logs?date=${today}`, {
        timeoutMs: 15_000,
      });
      const count = Array.isArray(res.entries) ? res.entries.length : 0;
      setTodayLogBlocks(count);
      return count > 0;
    } catch {
      setTodayLogBlocks(0);
      return false;
    }
  }

  async function loadReport(opts?: { background?: boolean }) {
    setReportError(null);
    if (!opts?.background) {
      setReportLoading(true);
    }
    try {
      const res = await apiFetch<{ date: string; report: AIReport; model?: string }>(`/reports?date=${today}`, {
        timeoutMs: 15_000,
      });
      const normalized = normalizeReport(res.report, isKo);
      setReport(normalized);
      if (normalized) {
        writeCachedInsightsReport(today, locale, normalized);
      }
    } catch (err) {
      // 404 = no report yet; treat as empty state.
      const status = isApiFetchError(err) ? err.status : null;
      if (status === 404) {
        setReport(null);
        clearCachedInsightsReport(today, locale);
      } else {
        const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
        // Keep stale data visible when background refresh fails.
        if (!opts?.background || !report) {
          setReportError(err instanceof Error ? `${err.message}${hint}` : t.errorLoad);
        }
      }
    } finally {
      if (!opts?.background) {
        setReportLoading(false);
      }
    }
  }

  async function analyze() {
    setAnalyzing(true);
    setReportError(null);
    setInfoMessage(null);
    try {
      const res = await apiFetch<{ date: string; report: AIReport; cached: boolean }>(`/analyze`, {
        method: "POST",
        timeoutMs: 45_000,
        body: JSON.stringify({ date: today, force: true })
      });
      const normalized = normalizeReport(res.report, isKo);
      setReport(normalized);
      if (normalized) {
        writeCachedInsightsReport(today, locale, normalized);
      }
      void loadConsistency();
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setReportError(err instanceof Error ? `${err.message}${hint}` : t.errorAnalyze);
    } finally {
      setAnalyzing(false);
    }
  }

  async function quickstart() {
    setAnalyzing(true);
    setReportError(null);
    setInfoMessage(null);
    try {
      const log = await apiFetch<{ date: string; entries: unknown[]; note: string | null }>(`/logs?date=${today}`, {
        timeoutMs: 15_000,
      });
      const hasLog = Array.isArray(log.entries) && log.entries.length > 0;
      if (!hasLog) {
        const tmpl = DAILY_FLOW_TEMPLATES[DEFAULT_TEMPLATE_NAME] || [];
        await apiFetch(`/logs`, {
          method: "POST",
          timeoutMs: 20_000,
          body: JSON.stringify({ date: today, entries: tmpl, note: "Quickstart template" })
        });
        setTodayLogBlocks(tmpl.length);
      } else {
        setTodayLogBlocks((log.entries as unknown[]).length);
      }

      const res = await apiFetch<{ date: string; report: AIReport; cached: boolean }>(`/analyze`, {
        method: "POST",
        timeoutMs: 45_000,
        body: JSON.stringify({ date: today, force: true })
      });
      const normalized = normalizeReport(res.report, isKo);
      setReport(normalized);
      if (normalized) {
        writeCachedInsightsReport(today, locale, normalized);
      }
      void loadConsistency();
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setReportError(err instanceof Error ? `${err.message}${hint}` : t.errorQuickstart);
    } finally {
      setAnalyzing(false);
    }
  }

  async function loadConsistency() {
    setMetricsLoading(true);
    try {
      if (isE2ETestMode()) {
        setWeekly({ daysLogged: 0, daysTotal: 7, totalBlocks: 0, deepMinutes: 0 });
        setStreak({ current: 0, longest: 0 });
        return;
      }

      const start = new Date();
      start.setDate(start.getDate() - 6);
      const from = localYYYYMMDD(start);

      const res = await apiFetch<WeeklyInsightsResponse>(`/insights/weekly?from=${from}&to=${today}`, {
        timeoutMs: 15_000,
      });
      setWeekly({
        daysLogged: Number.isFinite(Number(res.weekly.days_logged)) ? Number(res.weekly.days_logged) : 0,
        daysTotal: Number.isFinite(Number(res.weekly.days_total)) ? Number(res.weekly.days_total) : 0,
        totalBlocks: Number.isFinite(Number(res.weekly.total_blocks)) ? Number(res.weekly.total_blocks) : 0,
        deepMinutes: Number.isFinite(Number(res.weekly.deep_minutes)) ? Number(res.weekly.deep_minutes) : 0,
      });
      const streakCurrent = Number.isFinite(Number(res.streak?.current)) ? Number(res.streak?.current) : 0;
      const streakLongest = Number.isFinite(Number(res.streak?.longest)) ? Number(res.streak?.longest) : 0;
      setStreak({
        current: streakCurrent,
        longest: streakLongest,
      });
    } catch {
      setWeekly({ daysLogged: 0, daysTotal: 7, totalBlocks: 0, deepMinutes: 0 });
      setStreak({ current: 0, longest: 0 });
    } finally {
      setMetricsLoading(false);
    }
  }

  async function loadCohortTrend() {
    setCohortLoading(true);
    try {
      const res = await apiFetch<CohortTrend>("/trends/cohort", {
        timeoutMs: 12_000,
      });
      setCohortTrend(res);
    } catch {
      setCohortTrend(null);
    } finally {
      setCohortLoading(false);
    }
  }

  async function loadProfileHealth() {
    try {
      const profile = await apiFetch<{
        age_group?: string;
        gender?: string;
        job_family?: string;
        work_mode?: string;
      }>("/preferences/profile", {
        timeoutMs: 12_000,
      });
      const required = [
        profile.age_group,
        profile.gender,
        profile.job_family,
        profile.work_mode,
      ];
      const missing = required.some((v) => !v || v === "unknown");
      setProfileMissingRequired(missing);
    } catch {
      setProfileMissingRequired(false);
    }
  }

  async function loadRecoveryActive() {
    try {
      const res = await apiFetch<RecoveryActive>("/recovery/active", {
        timeoutMs: 10_000,
      });
      setRecoveryActive(res);
    } catch {
      setRecoveryActive(null);
    }
  }

  async function loadRecoveryNudge() {
    try {
      const res = await apiFetch<RecoveryNudgeEnvelope>("/recovery/nudge", {
        timeoutMs: 10_000,
      });
      if (res.has_nudge && res.nudge) {
        setRecoveryNudge(res.nudge);
      } else {
        setRecoveryNudge(null);
      }
    } catch {
      setRecoveryNudge(null);
    }
  }

  async function acknowledgeRecoveryNudge() {
    if (!recoveryNudge?.nudge_id || nudgeAcking) return;
    setNudgeAcking(true);
    try {
      await apiFetch("/recovery/nudge/ack", {
        method: "POST",
        body: JSON.stringify({ nudge_id: recoveryNudge.nudge_id }),
        timeoutMs: 12_000,
      });
    } catch {
      // Keep UX non-blocking for temporary API failures.
    } finally {
      setRecoveryNudge(null);
      setNudgeAcking(false);
    }
  }

  React.useEffect(() => {
    // First paint should depend only on critical data.
    const cachedReport = readCachedInsightsReport(today, locale);
    if (cachedReport) {
      setReport(normalizeReport(cachedReport, isKo));
      setReportLoading(false);
    }
    void (async () => {
      const hasTodayLog = await loadTodayLog();
      if (cachedReport || hasTodayLog) {
        await loadReport({ background: Boolean(cachedReport) });
        return;
      }
      // Avoid unnecessary 404 fetch noise when today's report does not exist yet.
      setReport(null);
      clearCachedInsightsReport(today, locale);
      setReportLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, locale, isKo]);

  React.useEffect(() => {
    void loadConsistency();
    void loadCohortTrend();
    void loadProfileHealth();
    void loadRecoveryActive();
    void loadRecoveryNudge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trackedCohortEventsRef = React.useRef<Set<string>>(new Set());
  const trackCohortEvent = React.useCallback(
    async (
      eventType: "card_view" | "preview_badge_seen" | "rank_seen" | "tip_seen" | "preferences_click",
      payload: {
        threshold_variant: string;
        confidence_level: string;
        preview_mode: boolean;
        cohort_size: number;
        window_days: number;
        compare_by: string[];
      },
    ) => {
      const key = `${eventType}:${payload.threshold_variant}:${payload.preview_mode ? "1" : "0"}`;
      if (trackedCohortEventsRef.current.has(key)) return;
      trackedCohortEventsRef.current.add(key);
      try {
        await apiFetch<{ ok: boolean }>("/trends/cohort/event", {
          method: "POST",
          timeoutMs: 7_000,
          body: JSON.stringify({
            event_type: eventType,
            threshold_variant: payload.threshold_variant,
            confidence_level: payload.confidence_level,
            preview_mode: payload.preview_mode,
            cohort_size: payload.cohort_size,
            window_days: payload.window_days,
            compare_by: payload.compare_by,
          }),
        });
      } catch {
        // Ignore telemetry failures to keep UX path deterministic.
      }
    },
    [],
  );

  React.useEffect(() => {
    if (!cohortTrend || !cohortTrend.enabled || cohortTrend.insufficient_sample) return;
    const basePayload = {
      threshold_variant: cohortTrend.threshold_variant || "control",
      confidence_level: cohortTrend.confidence_level || "low",
      preview_mode: Boolean(cohortTrend.preview_mode),
      cohort_size: Number(cohortTrend.cohort_size || 0),
      window_days: Number(cohortTrend.window_days || 14),
      compare_by: Array.isArray(cohortTrend.compare_by) ? cohortTrend.compare_by : [],
    };
    void trackCohortEvent("card_view", basePayload);
    if (cohortTrend.preview_mode) {
      void trackCohortEvent("preview_badge_seen", basePayload);
      return;
    }
    if (cohortTrend.rank_label) {
      void trackCohortEvent("rank_seen", basePayload);
    }
    if (cohortTrend.actionable_tip) {
      void trackCohortEvent("tip_seen", basePayload);
    }
  }, [cohortTrend, trackCohortEvent]);

  const onCohortPreferencesClick = React.useCallback(() => {
    if (!cohortTrend) return;
    void trackCohortEvent("preferences_click", {
      threshold_variant: cohortTrend.threshold_variant || "control",
      confidence_level: cohortTrend.confidence_level || "low",
      preview_mode: Boolean(cohortTrend.preview_mode),
      cohort_size: Number(cohortTrend.cohort_size || 0),
      window_days: Number(cohortTrend.window_days || 14),
      compare_by: Array.isArray(cohortTrend.compare_by) ? cohortTrend.compare_by : [],
    });
  }, [cohortTrend, trackCohortEvent]);

  const hasReport = Boolean(report);
  const hasLog = todayLogBlocks > 0 || hasReport;
  const topPeak = report?.productivity_peaks?.[0] ?? null;
  const topFailure = report?.failure_patterns?.[0] ?? null;
  const reasonLines = React.useMemo(() => {
    if (!report) return [] as string[];
    const lines = [topPeak
      ? isKo
        ? `오늘 ${topPeak.start}~${topPeak.end} 구간에서 집중 패턴이 나타났어요.`
        : `You showed strong focus around ${topPeak.start}-${topPeak.end}.`
      : null,
      report.wellbeing_insight?.energy_curve_forecast || null,
      topFailure
        ? isKo
          ? `${topFailure.trigger} 때문에 흐름이 끊기는 경향이 보여요.`
          : `Your flow tends to break around: ${topFailure.trigger}.`
        : null]
      .filter((line): line is string => Boolean(line && line.trim()))
      .slice(0, 3);
    return lines;
  }, [report, topPeak, topFailure, isKo]);
  const primaryAction = report?.micro_advice?.[0] ?? null;
  const averageFocusMinutes = weekly.daysLogged > 0 ? Math.round(weekly.deepMinutes / weekly.daysLogged) : 0;
  const commonFailurePattern = topFailure?.pattern || t.noPattern;
  const fmtRate = (value: number | null) => (value === null ? "—" : `${Math.round(value)}%`);
  const fmtDelta = (value: number | null) => {
    if (value === null) return t.noPrevWeek;
    const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→";
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    const abs = Math.abs(value);
    const rounded = Number.isInteger(abs) ? `${abs}` : abs.toFixed(1);
    return `${arrow} ${sign}${rounded}%p ${t.trendVsLastWeek}`;
  };
  const compareByLabels = React.useMemo(() => {
    if (!cohortTrend?.compare_by?.length) return [] as string[];
    const dimMap: Record<string, string> = {
      age_group: t.dim_age_group,
      gender: t.dim_gender,
      job_family: t.dim_job_family,
      work_mode: t.dim_work_mode,
    };
    return cohortTrend.compare_by.map((dim) => dimMap[dim] || dim);
  }, [cohortTrend?.compare_by, t.dim_age_group, t.dim_gender, t.dim_job_family, t.dim_work_mode]);
  const confidenceLabel =
    cohortTrend?.confidence_level === "high"
      ? t.confidenceHigh
      : cohortTrend?.confidence_level === "medium"
        ? t.confidenceMedium
        : t.confidenceLow;
  const confidenceBadgeClass =
    cohortTrend?.confidence_level === "high"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : cohortTrend?.confidence_level === "medium"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-rose-200 bg-rose-50 text-rose-800";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div>
        <h1 className="title-serif text-3xl">{t.title}</h1>
        <p className="mt-1 text-sm text-mutedFg">{t.subtitle}</p>
        <p className="mt-2 text-sm text-mutedFg">
          {t.todayLabel}: <span className="font-semibold tracking-tight">{today}</span>
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
      {profileMissingRequired ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4">
          <p className="text-sm font-semibold">{t.profileSetupTitle}</p>
          <p className="mt-1 text-sm text-mutedFg">{t.profileSetupBody}</p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href="/app/insights?settings=1&settingsTab=profile">{t.profileSetupCta}</Link>
          </Button>
        </div>
      ) : null}
      {recoveryNudge ? (
        <div className="rounded-xl border border-brand/40 bg-brand/5 p-4">
          <p className="text-sm font-semibold">{t.nudgeTitle}</p>
          <p className="mt-1 text-sm text-mutedFg">{recoveryNudge.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <Link href="/app/daily-flow">{t.recoveryCta}</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={acknowledgeRecoveryNudge} disabled={nudgeAcking}>
              {t.nudgeDismiss}
            </Button>
          </div>
        </div>
      ) : null}
      {recoveryActive?.has_open_session ? (
        <div className="rounded-xl border border-brand/40 bg-brand/5 p-4">
          <p className="text-sm font-semibold">{t.recoveryTitle}</p>
          <p className="mt-1 text-sm text-mutedFg">
            {recoveryActive.elapsed_min !== null && recoveryActive.elapsed_min !== undefined
              ? `${t.recoveryBody} (${recoveryActive.elapsed_min}m)`
              : t.recoveryBody}
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link href="/app/daily-flow">{t.recoveryCta}</Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-12 shadow-soft">
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
                <div className="rounded-xl border bg-white/60 p-3">
                  <p className="text-xs text-mutedFg">{t.coreSentenceTitle}</p>
                  <p className="title-serif mt-1 text-2xl leading-snug">{report.coach_one_liner}</p>
                </div>
                <div className="rounded-xl border bg-white/60 p-3">
                  <p className="text-xs text-mutedFg">{t.reasonTitle}</p>
                  {reasonLines.length ? (
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-mutedFg">
                      {reasonLines.map((line, idx) => (
                        <li key={`${idx}-${line}`}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-mutedFg">{t.reasonEmpty}</p>
                  )}
                </div>
                <div className="rounded-xl border bg-brand/5 p-3">
                  <p className="text-xs text-mutedFg">{t.oneActionTitle}</p>
                  {primaryAction ? (
                    <p className="mt-1 text-sm font-medium">
                      {primaryAction.action}
                      <span className="ml-2 text-xs text-mutedFg">({primaryAction.duration_min}m)</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-mutedFg">{t.oneActionEmpty}</p>
                  )}
                </div>
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
              <div className="flex flex-col items-center py-4 text-center">
                <div className="empty-state-icon">
                  <FileText className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold">{t.coachEmptyTitle}</p>
                <p className="mt-1 text-sm text-mutedFg">{hasLog ? t.coachEmptyBody_hasLog : t.coachEmptyBody_noLog}</p>
                <p className="mt-1 text-xs text-mutedFg">{t.coachEmptyHint}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── AI Trust Badge (UX-C06) ─── */}
        <div className="lg:col-span-12 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div>
            <p className="text-xs font-semibold text-blue-900">{t.trustBadge}</p>
            <p className="mt-0.5 text-xs text-blue-800">{t.trustBadgeBody}</p>
          </div>
        </div>

        <Card className="lg:col-span-12 border-brand/30 bg-white/70 shadow-elevated">
          <CardHeader>
            <CardTitle>{t.nextTitle}</CardTitle>
            <CardDescription>
              {!hasLog ? t.nextDesc_noLog : !hasReport ? t.nextDesc_noReport : t.nextDesc_hasReport}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="inset-block">
                <p className="text-xs text-mutedFg">{t.progress}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-white/70 p-2 text-center">
                    <div className="font-semibold">{t.step_log}</div>
                    <div className={hasLog ? "mt-1 flex items-center justify-center gap-1 text-emerald-700" : "mt-1 text-mutedFg"}>
                      {hasLog ? <><CheckCircle2 className="h-3.5 w-3.5" />{t.statusDone}</> : <span className="text-lg">·</span>}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/70 p-2 text-center">
                    <div className="font-semibold">{t.step_analyze}</div>
                    <div className={hasReport ? "mt-1 flex items-center justify-center gap-1 text-emerald-700" : "mt-1 text-mutedFg"}>
                      {hasReport ? <><CheckCircle2 className="h-3.5 w-3.5" />{t.statusDone}</> : <span className="text-lg">·</span>}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/70 p-2 text-center">
                    <div className="font-semibold">{t.step_plan}</div>
                    <div className={hasReport ? "mt-1 flex items-center justify-center gap-1 text-emerald-700" : "mt-1 text-mutedFg"}>
                      {hasReport ? <><CheckCircle2 className="h-3.5 w-3.5" />{t.statusDone}</> : <span className="text-lg">·</span>}
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
                    <Button variant="ghost" size="sm" onClick={() => void loadReport({ background: Boolean(report) })} disabled={reportLoading}>
                      {t.cta_reload}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ─── Re-engagement loop (UX-C08): missed-day recovery ─── */}
        {!hasLog && streak.current === 0 && weekly.daysLogged > 0 ? (
          <Card className="lg:col-span-12 border-amber-200 bg-amber-50/50">
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center sm:flex-row sm:text-left">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <RotateCcw className="h-5 w-5 text-amber-700" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">{t.recoveryTitle}</p>
                <p className="mt-0.5 text-sm text-amber-800">{t.recoveryBody}</p>
              </div>
              <Button asChild size="sm">
                <Link href="/app/daily-flow">{t.recoveryCta}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

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
                {report.tomorrow_routine.slice(0, 3).map((it, idx) => (
                  <div key={idx} className="inset-block">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">
                        {it.start}–{it.end} · {normalizeRoutineActivityLabel(it.activity, isKo)}
                      </p>
                      <span className="rounded-full border bg-white/70 px-2 py-1 text-[11px] text-mutedFg">
                        {t.labelGoal}: {it.goal}
                      </span>
                    </div>
                  </div>
                ))}
                {report.tomorrow_routine.length > 3 ? (
                  <p className="text-xs text-mutedFg">{t.moreBlocks(report.tomorrow_routine.length - 3)}</p>
                ) : null}
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/reports/${today}`}>{t.cta_openReport}</Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="empty-state-icon">
                  <Clock className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold">{t.scheduleEmptyTitle}</p>
                <p className="mt-1 text-sm text-mutedFg">{t.scheduleEmptyBody}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader>
            <CardTitle>{t.cohortTitle}</CardTitle>
            <CardDescription>{t.cohortDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {cohortLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ) : !cohortTrend ? (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="empty-state-icon">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <p className="text-sm">
                  {t.errorCohort}
                </p>
              </div>
            ) : !cohortTrend.enabled ? (
              <div className="inset-block p-4">
                <p className="text-sm">{cohortTrend.message}</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/app/insights?settings=1&settingsTab=profile" onClick={onCohortPreferencesClick}>
                    {t.openSettings}
                  </Link>
                </Button>
              </div>
            ) : cohortTrend.insufficient_sample ? (
              <div className="inset-block p-4">
                <p className="text-sm">{cohortTrend.message}</p>
                <p className="mt-1 text-xs text-mutedFg">
                  {isKo
                    ? `현재 표본 ${cohortTrend.cohort_size}명 / 미리보기 최소 ${cohortTrend.preview_sample_size}명`
                    : `Current sample ${cohortTrend.cohort_size} / preview minimum ${cohortTrend.preview_sample_size}`}
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/app/insights?settings=1&settingsTab=profile" onClick={onCohortPreferencesClick}>
                    {t.adjustCompare}
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm">{cohortTrend.message}</p>
                <div className="inset-block p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{t.youVsSimilar}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border bg-white/70 px-2 py-1 text-[11px] text-mutedFg">
                        {t.similarUsers(cohortTrend.cohort_size)}
                      </span>
                      <span className={`rounded-full border px-2 py-1 text-[11px] ${confidenceBadgeClass}`}>
                        {t.confidence}: {confidenceLabel}
                      </span>
                      {cohortTrend.preview_mode ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                          {t.previewOnly}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {/* ─── Fixed-placement confidence line (UX-C04) ─── */}
                  <p className="mt-2 text-[11px] text-mutedFg">
                    {t.cohortSampleLine(cohortTrend.cohort_size, cohortTrend.window_days)}
                    {compareByLabels.length ? ` · ${t.compareBy}: ${compareByLabels.join(", ")}` : null}
                  </p>

                  {[
                    {
                      key: "focus",
                      label: t.myFocusRate,
                      mine: cohortTrend.my_focus_rate,
                      delta: cohortTrend.my_focus_delta_7d,
                      average: cohortTrend.metrics.focus_window_rate,
                    },
                    {
                      key: "rebound",
                      label: t.myReboundRate,
                      mine: cohortTrend.my_rebound_rate,
                      delta: cohortTrend.my_rebound_delta_7d,
                      average: cohortTrend.metrics.rebound_rate,
                    },
                    {
                      key: "recovery",
                      label: t.myRecoveryRate,
                      mine: cohortTrend.my_recovery_rate,
                      delta: cohortTrend.my_recovery_delta_7d,
                      average: cohortTrend.metrics.recovery_buffer_day_rate,
                    },
                  ]
                    .filter((row) => row.mine !== null)
                    .map((row) => (
                      <div key={row.key} className="mt-3 rounded-lg bg-white/60 p-3">
                        <p className="text-xs text-mutedFg">{row.label}</p>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <div>
                            <p className="title-serif text-2xl">{fmtRate(row.mine)}</p>
                            <p className="text-[11px] text-mutedFg">{t.labelMe}</p>
                            <p
                              className={
                                row.delta === null
                                  ? "text-[11px] text-mutedFg"
                                  : row.delta > 0
                                    ? "text-[11px] text-emerald-700"
                                    : row.delta < 0
                                      ? "text-[11px] text-rose-700"
                                      : "text-[11px] text-mutedFg"
                              }
                            >
                              {fmtDelta(row.delta)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="title-serif text-2xl text-mutedFg">{fmtRate(row.average)}</p>
                            <p className="text-[11px] text-mutedFg">{t.average}</p>
                          </div>
                        </div>
                      </div>
                    ))}

                  {!cohortTrend.preview_mode && cohortTrend.rank_label ? (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-mutedFg">{t.rank}</span>
                      <span className="rounded-full border bg-white/70 px-3 py-1 text-xs">
                        {cohortTrend.rank_label}
                      </span>
                    </div>
                  ) : null}

                  {!cohortTrend.preview_mode && cohortTrend.actionable_tip ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs font-semibold text-amber-900">{t.actionableTip}</p>
                      <p className="mt-1 text-sm text-amber-900">{cohortTrend.actionable_tip}</p>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/app/insights?settings=1&settingsTab=profile" onClick={onCohortPreferencesClick}>
                      {t.changeCompare}
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.weeklySimpleTitle}</CardTitle>
          <CardDescription>{t.weeklySimpleDesc}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {metricsLoading ? (
            <>
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </>
          ) : (
            <>
              <div className="rounded-xl border bg-white/50 p-4">
                <p className="text-xs text-mutedFg">{t.currentStreak}</p>
                <p className="title-serif mt-1 text-3xl">{streak.current}</p>
              </div>
              <div className="rounded-xl border bg-white/50 p-4">
                <p className="text-xs text-mutedFg">{t.avgFocusTime}</p>
                <p className="title-serif mt-1 text-3xl">{averageFocusMinutes}m</p>
              </div>
              <div className="rounded-xl border bg-white/50 p-4">
                <p className="text-xs text-mutedFg">{t.commonFailurePattern}</p>
                <p className="mt-2 text-sm">{commonFailurePattern}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
