"use client";

import Link from "next/link";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Sparkles, XCircle } from "lucide-react";

import { BillingValueCta } from "@/components/billing-value-cta";
import { useLocale } from "@/components/locale-provider";
import { TrustBadge } from "@/components/trust-badge";
import { trackProductEvent } from "@/lib/analytics";
import { ReportEnvelopeSchema } from "@/lib/api/schemas";
import { apiFetchWithSchema } from "@/lib/api/validated-fetch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isApiFetchError } from "@/lib/api-client";
import { extractErrorReferenceId, formatApiErrorMessage } from "@/lib/api-error";
import { isAnalyzeInProgressError } from "@/lib/analyze-error";
import { buildTomorrowRoutineIcs } from "@/lib/ics";
import { addDays, localYYYYMMDD } from "@/lib/date-utils";
import { type AIReport, normalizeReport } from "@/lib/report-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useEntitlements } from "@/lib/use-entitlements";



const PREVIEW_REPORT_EN: AIReport = {
  schema_version: 2,
  summary: "Preview: your plan breaks when sessions have no buffers. Tomorrow we’ll protect power hours and add recovery rules.",
  productivity_peaks: [{ start: "09:30", end: "11:00", reason: "Low interruptions and high energy." }],
  failure_patterns: [
    { pattern: "Context switching", trigger: "Meetings without reset", fix: "Add a 10-min buffer: water + notes + pick next task." }
  ],
  tomorrow_routine: [
    { start: "09:30", end: "10:30", activity: "Deep work sprint", goal: "Ship one concrete output" },
    { start: "10:40", end: "11:10", activity: "Admin/messages", goal: "Clear the top 5 blockers" }
  ],
  if_then_rules: [{ if: "If you drift", then: "Then do 5-min reset + 25-min sprint (no inbox)." }],
  coach_one_liner: "Protect one real deep work block, and add buffers where you usually break.",
  yesterday_plan_vs_actual: { comparison_note: "Preview: run Analyze to see this comparison.", top_deviation: "Preview: interruptions and missing buffers." },
  wellbeing_insight: {
    burnout_risk: "medium",
    energy_curve_forecast: "Energy is likely strongest in your 09:30-11:00 window.",
    note: "Keep one 10-min recovery buffer after intense blocks.",
  },
  micro_advice: [
    {
      action: "3-minute transition reset",
      when: "Before context switching",
      reason: "Reduces attention residue and protects focus depth.",
      duration_min: 3,
    },
  ],
  weekly_pattern_insight: "Weekly pattern preview: focus improves when mornings start with one uninterrupted deep-work block.",
};

const PREVIEW_REPORT_KO: AIReport = {
  schema_version: 2,
  summary:
    "미리보기: 쉴 틈 없이 달리면 지치기 쉽습니다. 내일은 중간에 휴식을 꼭 챙기고, 나만의 속도를 찾아보세요.",
  productivity_peaks: [{ start: "09:30", end: "11:00", reason: "방해가 적고 에너지가 높은 시간대입니다." }],
  failure_patterns: [
    {
      pattern: "회의 후 흐트러짐",
      trigger: "쉼표 없이 이어지는 회의들",
      fix: "10분만 쉬어가세요: 물 한 잔 마시고, 생각을 정리한 뒤에 다음 일을 시작하세요."
    }
  ],
  tomorrow_routine: [
    { start: "09:30", end: "10:30", activity: "온전한 집중 시간", goal: "중요한 일 하나 끝내기" },
    { start: "10:40", end: "11:10", activity: "연락 확인하기", goal: "밀린 메시지 정리" }
  ],
  if_then_rules: [{ if: "자꾸 미루고 싶을 때", then: "5분만 책상을 정리하고, 딱 20분만 시작해봅니다." }],
  coach_one_liner: "하루에 하나, 온전히 집중하는 시간을 챙겨보세요.",
  yesterday_plan_vs_actual: { comparison_note: "미리보기: 리포트가 생성되면 계획과 실제를 비교해드립니다.", top_deviation: "미리보기: 방해 요소와 휴식 부족." },
  wellbeing_insight: {
    burnout_risk: "medium",
    energy_curve_forecast: "09:30-11:00 구간에서 에너지 유지 가능성이 높습니다.",
    note: "강한 집중 블록 뒤에는 10분 회복 시간을 먼저 고정하세요.",
  },
  micro_advice: [
    {
      action: "전환 전 3분 리셋",
      when: "작업 전환 직전",
      reason: "주의 잔여 피로를 줄여 다음 블록 집중을 지킵니다.",
      duration_min: 3,
    },
  ],
  weekly_pattern_insight: "주간 패턴 미리보기: 아침 첫 블록을 지킨 날에 집중 유지율이 더 높았습니다.",
};



const REPORT_CACHE_TTL_MS = 1000 * 60 * 10;

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

function reportCacheKey(date: string, locale: string): string {
  return `routineiq:report-page:v1:${date}:${locale}`;
}

function readCachedReport(date: string, locale: string): AIReport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(reportCacheKey(date, locale));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts?: number; report?: AIReport };
    if (!parsed?.ts || !parsed?.report) return null;
    if (Date.now() - parsed.ts > REPORT_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(reportCacheKey(date, locale));
      return null;
    }
    return parsed.report;
  } catch {
    return null;
  }
}

function writeCachedReport(date: string, locale: string, report: AIReport): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(reportCacheKey(date, locale), JSON.stringify({ ts: Date.now(), report }));
  } catch {
    // Ignore cache storage failures.
  }
}

function clearCachedReport(date: string, locale: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(reportCacheKey(date, locale));
  } catch {
    // Ignore cache removal failures.
  }
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}





export default function ReportPage() {
  const router = useRouter();
  const params = useParams<{ date: string }>();
  const date = params.date;
  const today = React.useMemo(() => localYYYYMMDD(), []);

  const locale = useLocale();
  const isKo = locale === "ko";
  const PREVIEW_REPORT = isKo ? PREVIEW_REPORT_KO : PREVIEW_REPORT_EN;
  const t = React.useMemo(() => {
    if (isKo) {
      return {
        title: "나의 하루 리포트",
        subtitle: "오늘을 돌아보고 내일을 준비해요.",
        date: "날짜",
        today: "오늘",
        analyze: "이 날의 기록 정리하기",
        analyzing: "정리하는 중...",
        cancelAnalyze: "정리 취소",
        analyzeLimitReached: "오늘 분석 횟수를 모두 사용했습니다. 내일 다시 시도하거나 PRO로 업그레이드해 주세요.",
        upgradeNow: "PRO 보기",
        analyzeCanceled: "리포트 생성을 취소했습니다.",
        analyzeTimeoutHint: "분석이 길어지고 있어요. 잠시 후 다시 시도하거나 새로고침으로 결과를 확인해 주세요.",
        analyzeRecoveryHint: "결과를 확인 중입니다. 준비되는 즉시 이 화면을 자동으로 갱신합니다.",
        analyzeProgressHint: "리포트를 생성 중입니다. 페이지를 이동해도 현재 결과는 보존됩니다.",
        refresh: "다시 불러오기",
        loading: "잠시만요...",
        noReportTitle: "리포트를 만들어 볼까요?",
        noReportDesc: "오늘 기록으로 내일 계획을 만들어 드려요.",
        analyzeNow: "리포트 만들기",
        previewTitle: "리포트 예시",
        previewDesc: "분석이 완료되면 나만의 리포트가 만들어져요.",
        coachOneLiner: "오늘의 한 마디",
        coachOneLinerDesc: "지금 바로 해볼 행동 한 가지예요.",
        dayReview: "오늘의 요약",
        dayReviewDesc: "오늘의 흐름과 내일 시작점을 정리했어요.",
        wellbeingTitle: "컨디션 인사이트",
        wellbeingDesc: "에너지 흐름과 회복 신호를 정리했어요.",
        burnoutRisk: "에너지 부담 신호",
        energyForecast: "에너지 곡선 예측",
        wellbeingNote: "컨디션 메모",
        weeklyPattern: "주간 패턴",
        microAdviceTitle: "5분 실행 가이드",
        microAdviceDesc: "지금 실행하기 쉬운 우선순위예요.",
        primaryAction: "Primary",
        secondaryActions: "Secondary",
        showMoreAdvice: "더 보기",
        showLessAdvice: "접기",
        durationMin: "소요",
        comparisonNote: "계획 비교 메모",
        topDeviation: "우선 확인할 지점",
        powerHours: "집중이 잘 된 시간",
        powerHoursDesc: "자연스럽게 집중했던 시간들.",
        focusPatternTitle: "집중 패턴",
        focusPatternDesc: "대표 집중 시간과 저하 구간을 정리했어요.",
        focusPatternRepresentative: "대표 집중 시간",
        focusPatternDrop: "저하 구간",
        focusPatternCause: "원인",
        noPowerHours: "기록이 더 쌓이면 집중 시간대가 더 선명해져요.",
        brokeFocus: "방해가 되었던 것들",
        brokeFocusDesc: "원인과 해결 제안.",
        trigger: "원인",
        fix: "제안",
        noFailure: "특별한 방해 요소가 없었어요.",
        optimizedPlan: "내일을 위한 추천 흐름",
        optimizedPlanDesc: "내 페이스를 해치지 않도록 조정한 내일 흐름이에요.",
        exportIcs: "캘린더로 내보내기 (.ics)",
        exporting: "내보내는 중...",
        noOptimizedPlan: "아직 추천 흐름이 없어요. 기록/분석 후 자동으로 표시돼요.",
        goal: "실행 포인트",
        exportGuide: "내보내기 전에 아래 추천 흐름을 확인해 주세요.",
        recoveryRules: "다시 집중하는 팁",
        recoveryRulesDesc: "흐름이 끊길 때 바로 꺼내 쓰는 짧은 가이드예요.",
        noRecovery: "아직 팁이 없어요.",
        ifLabel: "이럴 땐",
        thenLabel: "이렇게 해보세요",
        failedLoad: "리포트를 불러오지 못했어요",
        analyzeFailed: "분석에 실패했어요",
        errorReference: "오류 참조 ID",
        exportNoBlocks: "내보낼 일정이 없어요",
        exportFailed: "캘린더 내보내기에 실패했어요",
        heroNextAction: "지금 할 한 가지",
        heroKeyMetrics: "핵심 지표",
        trustBadge: "AI 참고 안내",
        trustBadgeBody: "기록을 바탕으로 정리한 참고 정보예요. 기록이 쌓일수록 개인화 정확도가 높아져요.",
        burnoutHigh: "높음",
        burnoutLow: "낮음",
        burnoutMedium: "중간",
        labelNoAdvice: "아직 실행 가이드가 없어요.",
        labelExport: "Google/Apple 캘린더로 가져올 수 있는 .ics 파일로 내보냅니다",
        toggleActionPoint: "실행 포인트 열기/닫기",
      };
    }
    return {
      title: "AI Coach Report",
      subtitle: "Date-based report. Find what broke and design a better tomorrow.",
      date: "Date",
      today: "Today",
      analyze: "Analyze this day",
      analyzing: "Analyzing...",
      cancelAnalyze: "Cancel analyze",
      analyzeLimitReached: "You reached today's analyze limit. Retry tomorrow or upgrade to Pro.",
      upgradeNow: "View Pro",
      analyzeCanceled: "Report generation was canceled.",
      analyzeTimeoutHint: "Analysis is taking longer than expected. Retry shortly or refresh to check if the report is ready.",
      analyzeRecoveryHint: "Checking for the report in the background. This page will refresh automatically once ready.",
      analyzeProgressHint: "Generating your report. You can navigate away and come back later.",
      refresh: "Reload report",
      loading: "Loading...",
      noReportTitle: "No report yet",
      noReportDesc: "Run Analyze to generate summary, triggers, tomorrow plan, and recovery rules.",
      analyzeNow: "Start analyze",
      previewTitle: "What you’ll get",
      previewDesc: "Sample preview (personalized after analyze).",
      coachOneLiner: "Coach Tip of the Day",
      coachOneLinerDesc: "One action you can do right now.",
      dayReview: "Your Day in Review",
      dayReviewDesc: "Today’s flow and a practical starting point for tomorrow.",
      wellbeingTitle: "Energy & Recovery Insight",
      wellbeingDesc: "Energy trend and recovery signals from your logs.",
      burnoutRisk: "Energy load signal",
      energyForecast: "Energy forecast",
      wellbeingNote: "Recovery note",
      weeklyPattern: "Weekly pattern signal",
      microAdviceTitle: "5-Minute Micro Advice",
      microAdviceDesc: "Execution priorities you can act on now.",
      primaryAction: "Primary",
      secondaryActions: "Secondary",
      showMoreAdvice: "Show more",
      showLessAdvice: "Show less",
      durationMin: "Duration",
      comparisonNote: "Comparison Note",
      topDeviation: "Priority check",
      powerHours: "Your Power Hours",
      powerHoursDesc: "When you naturally perform best.",
      focusPatternTitle: "Focus pattern",
      focusPatternDesc: "Representative focus window and drop segment.",
      focusPatternRepresentative: "Representative focus window",
      focusPatternDrop: "Drop segment",
      focusPatternCause: "Cause",
      noPowerHours: "No power hours detected yet.",
      brokeFocus: "What Broke Your Focus",
      brokeFocusDesc: "Triggers + specific fixes.",
      trigger: "Trigger",
      fix: "Fix",
      noFailure: "No failure patterns detected yet.",
      optimizedPlan: "Your Optimized Day Plan",
      optimizedPlanDesc: "A realistic routine flow adjusted for your pace.",
      exportIcs: "Export to Calendar (.ics)",
      exporting: "Exporting...",
      noOptimizedPlan: "No optimized plan generated yet.",
      goal: "Action guide",
      exportGuide: "Review the schedule below before exporting.",
      recoveryRules: "Smart Recovery Rules",
      recoveryRulesDesc: "Short prompts to regain momentum quickly.",
      noRecovery: "No recovery rules generated yet.",
      ifLabel: "IF",
      thenLabel: "THEN",
      failedLoad: "Failed to load report",
      analyzeFailed: "Analyze failed",
      errorReference: "Error reference",
      exportNoBlocks: "No routine blocks to export",
      exportFailed: "Failed to export calendar",
      heroNextAction: "One thing to do now",
      heroKeyMetrics: "Key Metrics",
      trustBadge: "AI Notice",
      trustBadgeBody: "This is reference guidance based on your logs. Accuracy improves as you log more days.",
      burnoutHigh: "High",
      burnoutLow: "Low",
      burnoutMedium: "Medium",
      labelNoAdvice: "No micro advice generated yet.",
      labelExport: "Export as .ics for Google Calendar / Apple Calendar",
      toggleActionPoint: "Toggle action point",
    };
  }, [isKo]);

  const [loading, setLoading] = React.useState(true);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [analyzeHint, setAnalyzeHint] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [showAllMicroAdvice, setShowAllMicroAdvice] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<AIReport | null>(null);
  const { entitlements } = useEntitlements();
  const topPeak = report?.productivity_peaks?.[0] ?? null;
  const topFailure = report?.failure_patterns?.[0] ?? null;
  const burnoutRisk =
    report?.wellbeing_insight?.burnout_risk === "low" || report?.wellbeing_insight?.burnout_risk === "high"
      ? report.wellbeing_insight.burnout_risk
      : "medium";
  const burnoutRiskLabel =
    burnoutRisk === "high"
      ? t.burnoutHigh
      : burnoutRisk === "low"
        ? t.burnoutLow
        : t.burnoutMedium;
  const burnoutBadgeClass =
    burnoutRisk === "high"
      ? "border-red-300 bg-red-50 text-red-700"
      : burnoutRisk === "low"
        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
        : "border-amber-300 bg-amber-50 text-amber-700";
  const microAdviceList = report?.micro_advice ?? [];
  const visibleMicroAdvice = showAllMicroAdvice ? microAdviceList : microAdviceList.slice(0, 1);
  const analyzeLimitReached =
    !entitlements.is_pro && entitlements.analyze_remaining_today <= 0;
  const analyzeAbortRef = React.useRef<AbortController | null>(null);
  const reportRecoveryPollingRef = React.useRef(false);
  const reportRecoveryCancelledRef = React.useRef(false);

  const pollUntilReportReady = React.useCallback(async () => {
    if (reportRecoveryPollingRef.current) return;
    reportRecoveryPollingRef.current = true;
    setAnalyzeHint(t.analyzeRecoveryHint);
    try {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        if (reportRecoveryCancelledRef.current) return;
        await waitMs(5_000);
        if (reportRecoveryCancelledRef.current) return;

        try {
          const res = await apiFetchWithSchema(
            `/reports?date=${date}`,
            ReportEnvelopeSchema,
            { timeoutMs: 12_000, retryOnTimeout: false },
            "reports timeout recovery"
          );
          if (reportRecoveryCancelledRef.current) return;
          const normalized = normalizeReport(res.report, isKo);
          setReport(normalized);
          if (normalized) writeCachedReport(date, locale, normalized);
          setError(null);
          setAnalyzeHint(null);
          return;
        } catch (err) {
          if (isApiFetchError(err) && err.status === 404) {
            continue;
          }
        }
      }
    } finally {
      reportRecoveryPollingRef.current = false;
      if (!reportRecoveryCancelledRef.current) {
        setAnalyzeHint(null);
      }
    }
  }, [date, isKo, locale, t.analyzeRecoveryHint]);

  async function load(opts?: { background?: boolean }) {
    setError(null);
    if (opts?.background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await apiFetchWithSchema(
        `/reports?date=${date}`,
        ReportEnvelopeSchema,
        { timeoutMs: 15_000 },
        "reports response"
      );
      const normalized = normalizeReport(res.report, isKo);
      setReport(normalized);
      if (normalized) writeCachedReport(date, locale, normalized);
    } catch (err) {
      const status = isApiFetchError(err) ? err.status : null;
      if (status === 404) {
        setReport(null);
        clearCachedReport(date, locale);
      } else {
        // Keep stale report visible when background refresh fails.
        if (!opts?.background || !report) {
          setError(
            formatApiErrorMessage(err, {
              fallbackMessage: t.failedLoad,
              referenceLabel: t.errorReference,
            })
          );
        }
      }
    } finally {
      if (opts?.background) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }

  async function analyze() {
    if (analyzeLimitReached) {
      setError(t.analyzeLimitReached);
      return;
    }
    setError(null);
    setAnalyzeHint(t.analyzeProgressHint);
    setAnalyzing(true);
    trackProductEvent("analyze_started", { source: "report", date });
    let startedRecoveryPolling = false;
    const controller = new AbortController();
    analyzeAbortRef.current = controller;
    try {
      const res = await apiFetchWithSchema(
        `/analyze`,
        ReportEnvelopeSchema,
        {
          method: "POST",
          timeoutMs: 45_000,
          body: JSON.stringify({ date, force: true }),
          signal: controller.signal,
        },
        "analyze response"
      );
      const normalized = normalizeReport(res.report, isKo);
      setReport(normalized);
      if (normalized) writeCachedReport(date, locale, normalized);
      trackProductEvent("analyze_succeeded", { source: "report", date });
    } catch (err) {
      if (controller.signal.aborted) {
        trackProductEvent("analyze_canceled", { source: "report", date });
        setError(t.analyzeCanceled);
        return;
      }
      trackProductEvent("analyze_failed", {
        source: "report",
        date,
        meta: {
          code: isApiFetchError(err) ? err.code ?? null : null,
          status: isApiFetchError(err) ? err.status ?? null : null,
        },
      });
      if (isApiFetchError(err) && err.code === "timeout") {
        setError(t.analyzeTimeoutHint);
        startedRecoveryPolling = true;
        void pollUntilReportReady();
        return;
      }
      if (isAnalyzeInProgressError(err)) {
        setError(null);
        startedRecoveryPolling = true;
        void pollUntilReportReady();
        return;
      }
      setError(
        formatApiErrorMessage(err, {
          fallbackMessage: t.analyzeFailed,
          referenceLabel: t.errorReference,
        })
      );
    } finally {
      analyzeAbortRef.current = null;
      setAnalyzing(false);
      if (!startedRecoveryPolling) {
        setAnalyzeHint(null);
      }
    }
  }

  function cancelAnalyze() {
    analyzeAbortRef.current?.abort();
  }

  async function exportCalendar() {
    setError(null);
    setExporting(true);
    try {
      if (!report?.tomorrow_routine?.length) throw new Error(t.exportNoBlocks);
      const routineForDate = addDays(date, 1);
      const ics = buildTomorrowRoutineIcs({ routineForDate, blocks: report.tomorrow_routine });
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `routineiq-${routineForDate}-routine.ics`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.exportFailed);
    } finally {
      setExporting(false);
    }
  }

  React.useEffect(() => {
    const cached = readCachedReport(date, locale);
    if (cached) {
      setReport(normalizeReport(cached, isKo));
      setLoading(false);
    }
    void load({ background: Boolean(cached) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, locale, isKo]);

  React.useEffect(() => {
    setShowAllMicroAdvice(false);
  }, [date, report?.schema_version]);

  React.useEffect(
    () => () => {
      reportRecoveryCancelledRef.current = true;
      analyzeAbortRef.current?.abort();
    },
    []
  );

  React.useEffect(() => {
    if (!error) return;
    trackProductEvent("ui_error_banner_shown", {
      source: "report",
      date,
      meta: {
        reference_id: extractErrorReferenceId(error),
      },
    });
  }, [date, error]);

  const trustMetrics = React.useMemo(() => {
    const metrics: Array<{ label: string; value: string; tone?: "neutral" | "good" | "warn" }> = [];
    const inputQuality = report?.analysis_meta?.input_quality_score;
    if (typeof inputQuality === "number") {
      metrics.push({
        label: isKo ? "기록 완성도" : "Input quality",
        value: `${Math.round(inputQuality)}/100`,
        tone: inputQuality >= 70 ? "good" : inputQuality >= 40 ? "neutral" : "warn",
      });
    }
    const profileCoverage = report?.analysis_meta?.profile_coverage_pct;
    if (typeof profileCoverage === "number") {
      metrics.push({
        label: isKo ? "프로필 완성도" : "Profile coverage",
        value: `${Math.round(profileCoverage)}%`,
        tone: profileCoverage >= 75 ? "good" : profileCoverage >= 40 ? "neutral" : "warn",
      });
    }
    const loggedEntries = report?.analysis_meta?.logged_entry_count;
    if (typeof loggedEntries === "number") {
      metrics.push({
        label: isKo ? "분석 반영 기록" : "Entries analyzed",
        value: isKo ? `${Math.round(loggedEntries)}개` : `${Math.round(loggedEntries)}`,
        tone: loggedEntries >= 6 ? "good" : loggedEntries >= 3 ? "neutral" : "warn",
      });
    }
    const retryCount = report?.analysis_meta?.schema_retry_count;
    if (typeof retryCount === "number") {
      const roundedRetry = Math.round(retryCount);
      metrics.push({
        label: isKo ? "분석 안정성" : "Analysis stability",
        value:
          roundedRetry === 0
            ? isKo
              ? "안정"
              : "Stable"
            : roundedRetry <= 1
              ? isKo
                ? "보통"
                : "Moderate"
              : isKo
                ? `재시도 ${roundedRetry}회`
                : "Needs check",
        tone: retryCount === 0 ? "good" : retryCount <= 1 ? "neutral" : "warn",
      });
    }
    return metrics.slice(0, 4);
  }, [
    isKo,
    report?.analysis_meta?.input_quality_score,
    report?.analysis_meta?.logged_entry_count,
    report?.analysis_meta?.profile_coverage_pct,
    report?.analysis_meta?.schema_retry_count,
  ]);
  const trustHint = React.useMemo(() => {
    if (!report) {
      return isKo
        ? "아직 리포트가 없어 예시 기반 안내만 표시돼요."
        : "No report yet, so only preview guidance is shown.";
    }
    const coverage = Number(report.analysis_meta?.profile_coverage_pct ?? 0);
    if (coverage > 0 && coverage < 75) {
      return isKo
        ? "프로필을 조금 더 채우면 내일 계획이 더 내 상황에 맞아집니다."
        : "Completing profile details improves tomorrow-plan personalization strength.";
    }
    const entries = Number(report.analysis_meta?.logged_entry_count ?? 0);
    if (entries > 0 && entries < 3) {
      return isKo
        ? "기록이 아직 적어 제안 폭이 좁게 보일 수 있어요."
        : "With few input entries, guidance may stay conservative.";
    }
    return isKo
      ? "기록량이 유지되면 리포트 정밀도와 실행 추천의 일관성이 높아집니다."
      : "Consistent logging improves report precision and action consistency.";
  }, [isKo, report]);
  const trustActions = React.useMemo(() => {
    const actions: Array<{ label: string; href: string }> = [];
    if ((report?.analysis_meta?.profile_coverage_pct ?? 100) < 75) {
      actions.push({
        label: isKo ? "프로필 보완" : "Complete profile",
        href: "/app/settings/profile",
      });
    }
    if (analyzeLimitReached) {
      actions.push({
        label: isKo ? "PRO 보기" : "View Pro",
        href: "/app/billing",
      });
    } else if (!report) {
      actions.push({
        label: isKo ? "기록 입력" : "Add log",
        href: "/app/log",
      });
    }
    return actions.slice(0, 2);
  }, [analyzeLimitReached, isKo, report]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="title-serif text-3xl">{t.title}</h1>
          <p className="mt-1 text-sm text-mutedFg">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-mutedFg">{t.date}</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => router.push(`/app/reports/${e.target.value}`)}
              className="w-[160px]"
            />
            <Button variant="ghost" size="sm" onClick={() => router.push(`/app/reports/${today}`)} disabled={date === today}>
              {t.today}
            </Button>
          </div>
          <Button onClick={analyze} disabled={analyzing || analyzeLimitReached}>
            <Sparkles className="h-4 w-4" />
            {analyzing ? t.analyzing : t.analyze}
          </Button>
          {analyzeLimitReached ? (
            <Button asChild variant="outline">
              <Link
                href="/app/billing?from=report_limit"
                onClick={() =>
                  trackProductEvent("billing_cta_clicked", {
                    source: "report_limit",
                  })
                }
              >
                {t.upgradeNow}
              </Link>
            </Button>
          ) : null}
          {analyzing ? (
            <Button variant="outline" onClick={cancelAnalyze}>
              <XCircle className="h-4 w-4" />
              {t.cancelAnalyze}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => void load({ background: Boolean(report) })} disabled={loading || refreshing}>
            {refreshing ? t.loading : t.refresh}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="whitespace-pre-line rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      ) : null}
      {analyzeHint ? (
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-3 text-sm text-mutedFg">{analyzeHint}</div>
      ) : null}
      {analyzeLimitReached ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {t.analyzeLimitReached}
        </div>
      ) : null}

      {loading ? (
        <div role="status" aria-live="polite" className="grid gap-4 lg:grid-cols-12">
          <span className="sr-only">{t.loading}</span>
          <Card className="lg:col-span-12">
            <CardHeader>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-72 mt-1" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
          <Card className="lg:col-span-6">
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56 mt-1" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </CardContent>
          </Card>
          <Card className="lg:col-span-6">
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56 mt-1" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-20 w-full rounded-lg" />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {!loading && !report ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.noReportTitle}</CardTitle>
            <CardDescription>{t.noReportDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={analyze} disabled={analyzing || analyzeLimitReached}>
              <Sparkles className="h-4 w-4" />
              {analyzing ? t.analyzing : t.analyzeNow}
            </Button>
            {analyzeLimitReached ? (
              <Button asChild variant="outline" className="ml-2">
                <Link
                  href="/app/billing?from=reports"
                  onClick={() =>
                    trackProductEvent("billing_cta_clicked", {
                      source: "report_empty_limit",
                    })
                  }
                >
                  {t.upgradeNow}
                </Link>
              </Button>
            ) : null}
            {analyzing ? (
              <Button variant="ghost" className="ml-2" onClick={cancelAnalyze}>
                <XCircle className="h-4 w-4" />
                {t.cancelAnalyze}
              </Button>
            ) : null}

            <div className="mt-5 space-y-3">
              <div className="rounded-xl border bg-white/50 p-4">
                <p className="text-sm font-semibold">{t.previewTitle}</p>
                <p className="mt-1 text-xs text-mutedFg">{t.previewDesc}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.dayReview}</p>
                  <p className="mt-2 text-sm">{PREVIEW_REPORT.coach_one_liner}</p>
                </div>
                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.optimizedPlan}</p>
                  <p className="mt-2 text-sm">
                    {PREVIEW_REPORT.tomorrow_routine[0]?.start}–{PREVIEW_REPORT.tomorrow_routine[0]?.end} ·{" "}
                    {normalizeRoutineActivityLabel(PREVIEW_REPORT.tomorrow_routine[0]?.activity || "", isKo)}
                  </p>
                  <p className="mt-1 text-xs text-mutedFg">
                    {t.goal}: {PREVIEW_REPORT.tomorrow_routine[0]?.goal}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!loading && report ? (
        <div className="grid gap-4 lg:grid-cols-12">
          {/* ─── Hero first fold: core sentence + one action ─── */}
          <Card className="lg:col-span-12 border-brand/20 shadow-elevated">
            <CardHeader>
              <CardTitle>{t.coachOneLiner}</CardTitle>
              <CardDescription>{t.coachOneLinerDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="title-serif text-2xl leading-snug">{report.coach_one_liner}</p>

              {/* Next 1 action */}
              {(report.micro_advice?.[0] || report.if_then_rules?.[0]) ? (
                <div className="rounded-xl bg-brand/5 border border-brand/15 p-4">
                  <p className="text-xs font-semibold text-brand">{t.heroNextAction}</p>
                  {report.micro_advice?.[0] ? (
                    <p className="mt-1 text-sm font-medium">
                      {report.micro_advice[0].action}
                      <span className="ml-2 text-xs text-mutedFg">({report.micro_advice[0].duration_min}m)</span>
                    </p>
                  ) : report.if_then_rules?.[0] ? (
                    <p className="mt-1 text-sm"><span className="font-semibold">{t.ifLabel}:</span> {report.if_then_rules[0].if} → <span className="font-semibold">{t.thenLabel}:</span> {report.if_then_rules[0].then}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-xl bg-white/60 p-3">
                <p className="text-xs text-mutedFg">{t.burnoutRisk}</p>
                <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${burnoutBadgeClass}`}>
                  {burnoutRiskLabel}
                </span>
              </div>

              <BillingValueCta source="reports" />
            </CardContent>
          </Card>

          {/* ─── AI Trust Badge (UX-C06) ─── */}
          <TrustBadge
            className="lg:col-span-12"
            title={t.trustBadge}
            body={t.trustBadgeBody}
            metrics={trustMetrics}
            hint={trustHint}
            actions={trustActions}
          />

          <Card className="lg:col-span-12">
            <CardHeader>
              <CardTitle>{t.dayReview}</CardTitle>
              <CardDescription>{t.dayReviewDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{report.summary}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.comparisonNote}</p>
                  <p className="mt-1 text-sm">{report.yesterday_plan_vs_actual.comparison_note}</p>
                </div>
                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.topDeviation}</p>
                  <p className="mt-1 text-sm">{report.yesterday_plan_vs_actual.top_deviation}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-6">
            <CardHeader>
              <CardTitle>{t.wellbeingTitle}</CardTitle>
              <CardDescription>{t.wellbeingDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border bg-white/50 p-4">
                <p className="text-xs text-mutedFg">{t.energyForecast}</p>
                <p className="mt-1 text-sm">{report.wellbeing_insight?.energy_curve_forecast}</p>
              </div>
              <div className="rounded-xl border bg-white/50 p-4">
                <p className="text-xs text-mutedFg">{t.wellbeingNote}</p>
                <p className="mt-1 text-sm">{report.wellbeing_insight?.note}</p>
              </div>
              <div className="rounded-xl border bg-white/50 p-4">
                <p className="text-xs text-mutedFg">{t.weeklyPattern}</p>
                <p className="mt-1 text-sm">{report.weekly_pattern_insight}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-6">
            <CardHeader>
              <CardTitle>{t.microAdviceTitle}</CardTitle>
              <CardDescription>{t.microAdviceDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {microAdviceList.length ? (
                <>
                  {microAdviceList[0] ? (
                    <div className="rounded-xl border bg-brand/5 p-4">
                      <p className="text-xs font-semibold text-brand">{t.primaryAction}</p>
                      <p className="mt-1 text-sm font-semibold">{microAdviceList[0].action}</p>
                      <p className="mt-1 text-xs text-mutedFg">{microAdviceList[0].when}</p>
                      <p className="mt-2 text-sm">{microAdviceList[0].reason}</p>
                    </div>
                  ) : null}
                  {microAdviceList.length > 1 ? (
                    <details className="rounded-xl border bg-white/50 p-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        {t.secondaryActions} ({microAdviceList.length - 1})
                      </summary>
                      <div className="mt-2 space-y-2">
                        {(showAllMicroAdvice ? microAdviceList.slice(1) : microAdviceList.slice(1, 3)).map((item, idx) => (
                          <div key={idx} className="rounded-lg border bg-white/70 p-3">
                            <p className="text-sm font-semibold">{item.action}</p>
                            <p className="mt-1 text-xs text-mutedFg">{item.when}</p>
                          </div>
                        ))}
                        {microAdviceList.length > 3 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowAllMicroAdvice((prev) => !prev)}
                          >
                            {showAllMicroAdvice ? t.showLessAdvice : `${t.showMoreAdvice} (${microAdviceList.length - 3})`}
                          </Button>
                        ) : null}
                      </div>
                    </details>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-mutedFg">{t.labelNoAdvice}</p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-6">
            <CardHeader>
              <CardTitle>{t.focusPatternTitle}</CardTitle>
              <CardDescription>{t.focusPatternDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border bg-white/50 p-4">
                <p className="text-xs text-mutedFg">{t.focusPatternRepresentative}</p>
                <p className="mt-1 text-sm font-semibold">
                  {topPeak ? `${topPeak.start}–${topPeak.end}` : t.noPowerHours}
                </p>
              </div>
              <div className="rounded-xl border bg-white/50 p-4">
                <p className="text-xs text-mutedFg">{t.focusPatternDrop}</p>
                <p className="mt-1 text-sm">
                  {topFailure?.trigger || (isKo ? "13:30 이후" : "After the first focus peak")}
                </p>
              </div>
              <div className="rounded-xl border bg-white/50 p-4">
                <p className="text-xs text-mutedFg">{t.focusPatternCause}</p>
                <p className="mt-1 text-sm">{topPeak?.reason || topFailure?.trigger || t.noPowerHours}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-6">
            <CardHeader>
              <CardTitle>{t.brokeFocus}</CardTitle>
              <CardDescription>{t.brokeFocusDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.failure_patterns.length ? (
                report.failure_patterns.map((f, idx) => (
                  <div key={idx} className="rounded-xl border bg-white/50 p-4">
                    <p className="text-sm font-semibold">{f.pattern}</p>
                    <p className="mt-1 text-xs text-mutedFg">
                      {t.trigger}: {f.trigger}
                    </p>
                    <p className="mt-2 text-sm">
                      <span className="font-semibold">{t.fix}:</span> {f.fix}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-mutedFg">{t.noFailure}</p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-7">
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle>{t.optimizedPlan}</CardTitle>
                <CardDescription>{t.optimizedPlanDesc}</CardDescription>
                <p className="mt-1 text-xs text-mutedFg">{t.exportGuide}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={exportCalendar}
                disabled={exporting || !report.tomorrow_routine.length}
                title={t.labelExport}
              >
                {exporting ? t.exporting : t.exportIcs}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.tomorrow_routine.length ? (
                report.tomorrow_routine.map((it, idx) => (
                  <div key={idx} className="rounded-xl border bg-white/50 p-4">
                    <p className="text-sm font-semibold">
                      {it.start}–{it.end} · {normalizeRoutineActivityLabel(it.activity, isKo)}
                    </p>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-mutedFg">
                        {t.toggleActionPoint}
                      </summary>
                      <p className="mt-2 rounded-lg border bg-white/70 px-2 py-1 text-sm">
                        {t.goal}: {it.goal}
                      </p>
                    </details>
                  </div>
                ))
              ) : (
                <p className="text-sm text-mutedFg">{t.noOptimizedPlan}</p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle>{t.recoveryRules}</CardTitle>
              <CardDescription>{t.recoveryRulesDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.if_then_rules.length ? (
                report.if_then_rules.map((r, idx) => (
                  <div key={idx} className="rounded-xl border bg-white/50 p-4">
                    <p className="text-xs text-mutedFg">{t.ifLabel}</p>
                    <p className="text-sm font-semibold">{r.if}</p>
                    <p className="mt-2 text-xs text-mutedFg">{t.thenLabel}</p>
                    <p className="text-sm">{r.then}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-mutedFg">{t.noRecovery}</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
