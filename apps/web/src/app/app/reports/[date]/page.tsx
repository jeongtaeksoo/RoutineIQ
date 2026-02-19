"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Sparkles, ShieldCheck } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, isApiFetchError } from "@/lib/api-client";
import { buildTomorrowRoutineIcs } from "@/lib/ics";
import { addDays, localYYYYMMDD } from "@/lib/date-utils";
import { type AIReport, normalizeReport } from "@/lib/report-utils";
import { Skeleton } from "@/components/ui/skeleton";



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
        refresh: "다시 불러오기",
        loading: "잠시만요...",
        noReportTitle: "리포트를 만들어 볼까요?",
        noReportDesc: "오늘 기록으로 내일 계획을 만들어 드려요.",
        analyzeNow: "리포트 만들기",
        previewTitle: "리포트 예시",
        previewDesc: "분석이 완료되면 나만의 리포트가 만들어져요.",
        coachOneLiner: "오늘의 한 마디",
        coachOneLinerDesc: "지금 바로 해볼 행동 한 가지예요.",
        schemaBadge: "리포트 스키마",
        qualityTitle: "AI 분석 품질",
        qualityDesc: "입력 데이터 품질과 개인화 수준이에요.",
        qualityScore: "입력 품질 점수",
        qualityProfile: "프로필 커버리지",
        qualityTier: "개인화 수준",
        qualitySignals: "웰빙 항목 수",
        qualityEntries: "활동 블록 수",
        qualityRetry: "스키마 재시도",
        qualitySufficiency: "데이터 충분성",
        suffLow: "보강 필요",
        suffMedium: "보통",
        suffHigh: "충분",
        lowSignalWarning: "데이터가 부족해 정확도가 낮아요. 다음에 활동 2개에 에너지·집중 점수를 남겨주세요.",
        tierLow: "초기",
        tierMedium: "보통",
        tierHigh: "높음",
        dayReview: "오늘의 요약",
        dayReviewDesc: "하루 요약과 코치 조언이에요.",
        wellbeingTitle: "웰빙 인사이트",
        wellbeingDesc: "번아웃 위험과 에너지 흐름 예측이에요.",
        burnoutRisk: "번아웃 위험도",
        energyForecast: "에너지 곡선 예측",
        wellbeingNote: "웰빙 메모",
        weeklyPattern: "주간 패턴",
        microAdviceTitle: "5분 실행 가이드",
        microAdviceDesc: "지금 바로 실행할 우선순위예요.",
        primaryAction: "Primary",
        secondaryActions: "Secondary",
        showMoreAdvice: "더 보기",
        showLessAdvice: "접기",
        durationMin: "소요",
        comparisonNote: "비교 메모",
        topDeviation: "주요 원인",
        powerHours: "집중이 잘 된 시간",
        powerHoursDesc: "자연스럽게 집중했던 시간들.",
        focusPatternTitle: "집중 패턴",
        focusPatternDesc: "대표 집중 시간과 저하 구간을 정리했어요.",
        focusPatternRepresentative: "대표 집중 시간",
        focusPatternDrop: "저하 구간",
        focusPatternCause: "원인",
        noPowerHours: "아직 데이터가 충분하지 않아요.",
        brokeFocus: "방해가 되었던 것들",
        brokeFocusDesc: "원인과 해결 제안.",
        trigger: "원인",
        fix: "제안",
        noFailure: "특별한 방해 요소가 없었어요.",
        optimizedPlan: "내일을 위한 추천 흐름",
        optimizedPlanDesc: "무리 없이 조정한 내일 일정이에요.",
        exportIcs: "캘린더로 내보내기 (.ics)",
        exporting: "내보내는 중...",
        noOptimizedPlan: "아직 추천 일정이 없어요.",
        goal: "실행 포인트",
        exportGuide: "내보내기 전에 아래 추천 흐름을 확인해 주세요.",
        recoveryRules: "나를 위한 팁",
        recoveryRulesDesc: "힘들 때 꺼내 보는 짧은 조언이에요.",
        noRecovery: "아직 팁이 없어요.",
        ifLabel: "이럴 땐",
        thenLabel: "이렇게 해보세요",
        failedLoad: "리포트를 불러오지 못했어요",
        analyzeFailed: "분석에 실패했어요",
        exportNoBlocks: "내보낼 일정이 없어요",
        exportFailed: "캘린더 내보내기에 실패했어요",
        heroNextAction: "지금 할 한 가지",
        heroKeyMetrics: "핵심 지표",
        trustBadge: "AI 참고 안내",
        trustBadgeBody: "기록 기반 추정이에요. 의학적 진단은 아니며, 기록이 쌓일수록 정확해져요.",
        burnoutHigh: "높음",
        burnoutLow: "낮음",
        burnoutMedium: "중간",
        labelNoAdvice: "아직 실행 가이드가 없어요.",
        labelExport: "Google/Apple 캘린더로 가져올 수 있는 .ics 파일로 내보냅니다",
      };
    }
    return {
      title: "AI Coach Report",
      subtitle: "Date-based report. Find what broke and design a better tomorrow.",
      date: "Date",
      today: "Today",
      analyze: "Analyze this day",
      analyzing: "Analyzing...",
      refresh: "Reload report",
      loading: "Loading...",
      noReportTitle: "No report yet",
      noReportDesc: "Run Analyze to generate summary, triggers, tomorrow plan, and recovery rules.",
      analyzeNow: "Start analyze",
      previewTitle: "What you’ll get",
      previewDesc: "Sample preview (personalized after analyze).",
      coachOneLiner: "Coach Tip of the Day",
      coachOneLinerDesc: "One action you can do right now.",
      schemaBadge: "Report schema",
      qualityTitle: "AI Analysis Quality",
      qualityDesc: "Shows input quality and personalization coverage for this report.",
      qualityScore: "Input quality score",
      qualityProfile: "Profile coverage",
      qualityTier: "Personalization tier",
      qualitySignals: "Wellbeing signals",
      qualityEntries: "Activity blocks",
      qualityRetry: "Schema retries",
      qualitySufficiency: "Data sufficiency",
      suffLow: "Needs more signals",
      suffMedium: "Moderate",
      suffHigh: "Sufficient",
      lowSignalWarning: "Signal quality is limited. Add energy/focus (1-5) for at least two blocks next time.",
      tierLow: "Starter",
      tierMedium: "Balanced",
      tierHigh: "High",
      dayReview: "Your Day in Review",
      dayReviewDesc: "Summary + plan vs actual (when available).",
      wellbeingTitle: "Wellbeing Insight",
      wellbeingDesc: "Burnout risk + energy-curve outlook.",
      burnoutRisk: "Burnout risk",
      energyForecast: "Energy forecast",
      wellbeingNote: "Wellbeing note",
      weeklyPattern: "Weekly pattern signal",
      microAdviceTitle: "5-Minute Micro Advice",
      microAdviceDesc: "Execution priorities you can act on now.",
      primaryAction: "Primary",
      secondaryActions: "Secondary",
      showMoreAdvice: "Show more",
      showLessAdvice: "Show less",
      durationMin: "Duration",
      comparisonNote: "Comparison Note",
      topDeviation: "Top Deviation",
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
      optimizedPlanDesc: "Tomorrow routine blocks.",
      exportIcs: "Export to Calendar (.ics)",
      exporting: "Exporting...",
      noOptimizedPlan: "No optimized plan generated yet.",
      goal: "Action guide",
      exportGuide: "Review the schedule below before exporting.",
      recoveryRules: "Smart Recovery Rules",
      recoveryRulesDesc: "If-Then rules to recover fast.",
      noRecovery: "No recovery rules generated yet.",
      ifLabel: "IF",
      thenLabel: "THEN",
      failedLoad: "Failed to load report",
      analyzeFailed: "Analyze failed",
      exportNoBlocks: "No routine blocks to export",
      exportFailed: "Failed to export calendar",
      heroNextAction: "One thing to do now",
      heroKeyMetrics: "Key Metrics",
      trustBadge: "AI Notice",
      trustBadgeBody: "This analysis is an estimate based on your logged data, not a medical diagnosis. Accuracy improves as you log more days.",
      burnoutHigh: "High",
      burnoutLow: "Low",
      burnoutMedium: "Medium",
      labelNoAdvice: "No micro advice generated yet.",
      labelExport: "Export as .ics for Google Calendar / Apple Calendar",
    };
  }, [isKo]);

  const [loading, setLoading] = React.useState(true);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [showAllMicroAdvice, setShowAllMicroAdvice] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<AIReport | null>(null);
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

  async function load(opts?: { background?: boolean }) {
    setError(null);
    if (opts?.background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await apiFetch<{ date: string; report: AIReport }>(`/reports?date=${date}`, {
        timeoutMs: 15_000,
      });
      const normalized = normalizeReport(res.report, isKo);
      setReport(normalized);
      if (normalized) writeCachedReport(date, locale, normalized);
    } catch (err) {
      const status = isApiFetchError(err) ? err.status : null;
      if (status === 404) {
        setReport(null);
        clearCachedReport(date, locale);
      } else {
        const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
        // Keep stale report visible when background refresh fails.
        if (!opts?.background || !report) {
          setError(err instanceof Error ? `${err.message}${hint}` : t.failedLoad);
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
    setError(null);
    setAnalyzing(true);
    try {
      const res = await apiFetch<{ date: string; report: AIReport }>(`/analyze`, {
        method: "POST",
        timeoutMs: 45_000,
        body: JSON.stringify({ date, force: true })
      });
      const normalized = normalizeReport(res.report, isKo);
      setReport(normalized);
      if (normalized) writeCachedReport(date, locale, normalized);
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setError(err instanceof Error ? `${err.message}${hint}` : t.analyzeFailed);
    } finally {
      setAnalyzing(false);
    }
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
          <Button onClick={analyze} disabled={analyzing}>
            <Sparkles className="h-4 w-4" />
            {analyzing ? t.analyzing : t.analyze}
          </Button>
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
            <Button onClick={analyze} disabled={analyzing}>
              <Sparkles className="h-4 w-4" />
              {analyzing ? t.analyzing : t.analyzeNow}
            </Button>

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
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white/50 p-3">
                <p className="text-xs text-mutedFg">{t.burnoutRisk}</p>
                <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${burnoutBadgeClass}`}>
                  {burnoutRiskLabel}
                </span>
              </div>
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
                        {isKo ? "(접기) 실행 포인트 보기" : "(Toggle) View action point"}
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
