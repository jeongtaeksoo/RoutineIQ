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
import { Skeleton } from "@/components/ui/skeleton";

type AIReport = {
  schema_version?: number;
  summary: string;
  productivity_peaks: { start: string; end: string; reason: string }[];
  failure_patterns: { pattern: string; trigger: string; fix: string }[];
  tomorrow_routine: { start: string; end: string; activity: string; goal: string }[];
  if_then_rules: { if: string; then: string }[];
  coach_one_liner: string;
  yesterday_plan_vs_actual: { comparison_note: string; top_deviation: string };
  wellbeing_insight?: {
    burnout_risk?: "low" | "medium" | "high" | string;
    energy_curve_forecast?: string;
    note?: string;
  };
  micro_advice?: { action: string; when: string; reason: string; duration_min: number }[];
  weekly_pattern_insight?: string;
  analysis_meta?: {
    input_quality_score?: number;
    profile_coverage_pct?: number;
    wellbeing_signals_count?: number;
    logged_entry_count?: number;
    schema_retry_count?: number;
    personalization_tier?: "low" | "medium" | "high" | string;
  };
};

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
    note: "강한 집중 블록 뒤에는 10분 회복 버퍼를 먼저 고정하세요.",
  },
  micro_advice: [
    {
      action: "전환 전 3분 리셋",
      when: "작업 전환 직전",
      reason: "주의 잔여 피로를 줄여 다음 블록 몰입을 지킵니다.",
      duration_min: 3,
    },
  ],
  weekly_pattern_insight: "주간 패턴 미리보기: 아침 첫 블록을 지킨 날에 집중 유지율이 더 높았습니다.",
};

// ... (addDays function remains same) ...

function addDays(dateStr: string, delta: number) {
  const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const REPORT_CACHE_TTL_MS = 1000 * 60 * 10;

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

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function normalizeReport(raw: AIReport, isKo: boolean): AIReport {
  const riskRaw = String(raw?.wellbeing_insight?.burnout_risk || "medium").toLowerCase();
  const burnout_risk = riskRaw === "low" || riskRaw === "high" ? riskRaw : "medium";
  const microRaw = Array.isArray(raw?.micro_advice) ? raw.micro_advice : [];
  const micro_advice = microRaw
    .filter((it) => it && typeof it.action === "string" && typeof it.when === "string" && typeof it.reason === "string")
    .map((it) => ({
      action: it.action,
      when: it.when,
      reason: it.reason,
      duration_min: Number.isFinite(Number(it.duration_min)) ? Math.min(20, Math.max(1, Number(it.duration_min))) : 5,
    }));
  const metaRaw = raw?.analysis_meta && typeof raw.analysis_meta === "object" ? raw.analysis_meta : {};
  const tierRaw = String(metaRaw?.personalization_tier || "low").toLowerCase();
  const personalization_tier =
    tierRaw === "high" || tierRaw === "medium" || tierRaw === "low" ? tierRaw : "low";
  return {
    ...raw,
    schema_version: Number.isFinite(Number(raw?.schema_version)) ? Number(raw?.schema_version) : 1,
    wellbeing_insight: {
      burnout_risk,
      energy_curve_forecast:
        typeof raw?.wellbeing_insight?.energy_curve_forecast === "string" && raw.wellbeing_insight.energy_curve_forecast.trim()
          ? raw.wellbeing_insight.energy_curve_forecast
          : (isKo ? "기록이 쌓이면 에너지 곡선 예측 정확도가 높아집니다." : "Energy-curve forecast improves as you log more days."),
      note:
        typeof raw?.wellbeing_insight?.note === "string" && raw.wellbeing_insight.note.trim()
          ? raw.wellbeing_insight.note
          : (isKo ? "내일은 회복 버퍼 1개를 먼저 고정해보세요." : "For tomorrow, lock one recovery buffer first."),
    },
    micro_advice,
    weekly_pattern_insight:
      typeof raw?.weekly_pattern_insight === "string" && raw.weekly_pattern_insight.trim()
        ? raw.weekly_pattern_insight
        : (isKo ? "주간 패턴은 최소 3일 기록 후 정확도가 높아집니다." : "Weekly pattern signal becomes clearer after at least 3 logged days."),
    analysis_meta: {
      input_quality_score: Number.isFinite(Number(metaRaw?.input_quality_score))
        ? Math.max(0, Math.min(100, Number(metaRaw.input_quality_score)))
        : 0,
      profile_coverage_pct: Number.isFinite(Number(metaRaw?.profile_coverage_pct))
        ? Math.max(0, Math.min(100, Number(metaRaw.profile_coverage_pct)))
        : 0,
      wellbeing_signals_count: Number.isFinite(Number(metaRaw?.wellbeing_signals_count))
        ? Math.max(0, Math.min(6, Math.round(Number(metaRaw.wellbeing_signals_count))))
        : 0,
      logged_entry_count: Number.isFinite(Number(metaRaw?.logged_entry_count))
        ? Math.max(0, Math.min(200, Math.round(Number(metaRaw.logged_entry_count))))
        : 0,
      schema_retry_count: Number.isFinite(Number(metaRaw?.schema_retry_count))
        ? Math.max(0, Math.min(3, Math.round(Number(metaRaw.schema_retry_count))))
        : 0,
      personalization_tier,
    },
  };
}

export default function ReportPage() {
  const router = useRouter();
  const params = useParams<{ date: string }>();
  const date = params.date;

  const locale = useLocale();
  const isKo = locale === "ko";
  const PREVIEW_REPORT = isKo ? PREVIEW_REPORT_KO : PREVIEW_REPORT_EN;
  const t = React.useMemo(() => {
    if (isKo) {
      return {
        title: "나의 하루 리포트",
        subtitle: "오늘 하루를 돌아보고, 내일은 조금 더 편안하게 흘러가도록 돕습니다.",
        date: "날짜",
        analyze: "이 날의 기록 정리하기",
        analyzing: "정리하는 중...",
        refresh: "다시 불러오기",
        loading: "잠시만요...",
        noReportTitle: "리포트를 만들 준비가 되었나요?",
        noReportDesc: "기록을 바탕으로 오늘의 흐름을 요약하고, 내일 챙겨야 할 것들을 정리해드립니다.",
        analyzeNow: "리포트 만들기",
        previewTitle: "리포트 예시",
        previewDesc: "분석이 완료되면 나만의 리포트가 만들어집니다.",
        coachOneLiner: "오늘의 한 마디",
        coachOneLinerDesc: "지금 바로 실행할 한 가지 행동입니다.",
        schemaBadge: "리포트 스키마",
        qualityTitle: "AI 분석 품질",
        qualityDesc: "입력 데이터 충실도와 개인화 커버리지를 표시합니다.",
        qualityScore: "입력 품질 점수",
        qualityProfile: "프로필 커버리지",
        qualityTier: "개인화 수준",
        qualitySignals: "웰빙 신호 수",
        qualityEntries: "활동 블록 수",
        qualityRetry: "스키마 재시도",
        qualitySufficiency: "데이터 충분성",
        suffLow: "보강 필요",
        suffMedium: "보통",
        suffHigh: "충분",
        lowSignalWarning: "신호가 부족해 분석 확신도가 낮습니다. 다음 기록에서 에너지/집중(1-5)을 최소 2개 블록에 입력해 주세요.",
        tierLow: "초기",
        tierMedium: "보통",
        tierHigh: "높음",
        dayReview: "오늘의 요약",
        dayReviewDesc: "하루의 흐름과 코치의 조언.",
        wellbeingTitle: "웰빙 인사이트",
        wellbeingDesc: "번아웃 위험과 에너지 곡선 예측입니다.",
        burnoutRisk: "번아웃 위험도",
        energyForecast: "에너지 곡선 예측",
        wellbeingNote: "웰빙 메모",
        weeklyPattern: "주간 패턴",
        microAdviceTitle: "5분 실행 가이드",
        microAdviceDesc: "짧게 바로 실행할 수 있는 행동입니다.",
        durationMin: "소요",
        comparisonNote: "비교 메모",
        topDeviation: "주요 원인",
        powerHours: "집중이 잘 된 시간",
        powerHoursDesc: "자연스럽게 몰입했던 순간들.",
        noPowerHours: "아직 데이터가 충분하지 않아요.",
        brokeFocus: "방해가 되었던 것들",
        brokeFocusDesc: "원인과 해결 제안.",
        trigger: "원인",
        fix: "제안",
        noFailure: "특별한 방해 요소가 없었습니다.",
        optimizedPlan: "내일을 위한 추천 흐름",
        optimizedPlanDesc: "무리가 되지 않도록 조정한 일정.",
        exportIcs: "캘린더로 내보내기 (.ics)",
        exporting: "내보내는 중...",
        noOptimizedPlan: "아직 추천 일정이 없습니다.",
        goal: "목표",
        recoveryRules: "나를 위한 팁",
        recoveryRulesDesc: "지치거나 힘들 때 꺼내보는 조언.",
        noRecovery: "아직 팁이 없습니다.",
        ifLabel: "이럴 땐",
        thenLabel: "이렇게 해보세요",
        failedLoad: "리포트를 불러오지 못했습니다",
        analyzeFailed: "분석에 실패했습니다",
        exportNoBlocks: "내보낼 일정이 없습니다",
        exportFailed: "캘린더 내보내기에 실패했습니다",
        heroNextAction: "지금 할 한 가지",
        heroKeyMetrics: "핵심 지표",
        trustBadge: "AI 참고 안내",
        trustBadgeBody: "이 분석은 기록된 데이터를 기반으로 한 추정이며, 의학적 진단이 아닙니다. 기록이 쌓일수록 정확도가 높아집니다."
      };
    }
    return {
      title: "AI Coach Report",
      subtitle: "Date-based report. Find what broke and design a better tomorrow.",
      date: "Date",
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
      microAdviceDesc: "Short actions you can execute right away.",
      durationMin: "Duration",
      comparisonNote: "Comparison Note",
      topDeviation: "Top Deviation",
      powerHours: "Your Power Hours",
      powerHoursDesc: "When you naturally perform best.",
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
      goal: "Goal",
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
      trustBadgeBody: "This analysis is an estimate based on your logged data, not a medical diagnosis. Accuracy improves as you log more days."
    };
  }, [isKo]);

  const [loading, setLoading] = React.useState(true);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<AIReport | null>(null);
  const burnoutRisk =
    report?.wellbeing_insight?.burnout_risk === "low" || report?.wellbeing_insight?.burnout_risk === "high"
      ? report.wellbeing_insight.burnout_risk
      : "medium";
  const burnoutRiskLabel = isKo
    ? burnoutRisk === "high"
      ? "높음"
      : burnoutRisk === "low"
        ? "낮음"
        : "중간"
    : burnoutRisk === "high"
      ? "High"
      : burnoutRisk === "low"
        ? "Low"
        : "Medium";
  const burnoutBadgeClass =
    burnoutRisk === "high"
      ? "border-red-300 bg-red-50 text-red-700"
      : burnoutRisk === "low"
        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
        : "border-amber-300 bg-amber-50 text-amber-700";
  const personalizationTier = report?.analysis_meta?.personalization_tier || "low";
  const personalizationTierLabel =
    personalizationTier === "high"
      ? t.tierHigh
      : personalizationTier === "medium"
        ? t.tierMedium
        : t.tierLow;
  const inputQualityScore = Math.round(report?.analysis_meta?.input_quality_score || 0);
  const dataSufficiency =
    inputQualityScore >= 75 ? t.suffHigh : inputQualityScore >= 50 ? t.suffMedium : t.suffLow;
  const lowSignalMode = inputQualityScore < 50;
  const peakTimeline = React.useMemo(() => {
    if (!report?.productivity_peaks?.length) return [];
    return report.productivity_peaks
      .map((p) => {
        const s = toMinutes(p.start);
        const e = toMinutes(p.end);
        if (s == null || e == null || e <= s) return null;
        return {
          start: p.start,
          end: p.end,
          reason: p.reason,
          leftPct: (s / 1440) * 100,
          widthPct: ((e - s) / 1440) * 100,
        };
      })
      .filter(Boolean) as Array<{
        start: string;
        end: string;
        reason: string;
        leftPct: number;
        widthPct: number;
      }>;
  }, [report]);

  async function load(opts?: { background?: boolean }) {
    setError(null);
    if (opts?.background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await apiFetch<{ date: string; report: AIReport }>(`/reports?date=${date}`, {
        timeoutMs: 18_000,
      });
      const normalized = normalizeReport(res.report, isKo);
      setReport(normalized);
      writeCachedReport(date, locale, normalized);
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
        body: JSON.stringify({ date, force: true })
      });
      const normalized = normalizeReport(res.report, isKo);
      setReport(normalized);
      writeCachedReport(date, locale, normalized);
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
                    {PREVIEW_REPORT.tomorrow_routine[0]?.activity}
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
          {/* ─── Hero first fold: Coach tip + 1 next action + 3 key metrics ─── */}
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

              {/* 3 Key metrics */}
              <div>
                <p className="text-xs text-mutedFg mb-2">{t.heroKeyMetrics}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-white/50 p-3 text-center">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${burnoutBadgeClass}`}>{burnoutRiskLabel}</span>
                    <p className="mt-1 text-[11px] text-mutedFg">{t.burnoutRisk}</p>
                  </div>
                  <div className="rounded-xl bg-white/50 p-3 text-center">
                    <p className="title-serif text-xl">{inputQualityScore}</p>
                    <p className="mt-1 text-[11px] text-mutedFg">{t.qualityScore}</p>
                  </div>
                  <div className="rounded-xl bg-white/50 p-3 text-center">
                    <p className="title-serif text-xl">{personalizationTierLabel}</p>
                    <p className="mt-1 text-[11px] text-mutedFg">{t.qualityTier}</p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-mutedFg">
                {t.schemaBadge}: v{report.schema_version ?? 1}
              </p>
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

          {report.analysis_meta ? (
            <Card className="lg:col-span-12">
              <CardHeader>
                <CardTitle>{t.qualityTitle}</CardTitle>
                <CardDescription>{t.qualityDesc}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.qualityScore}</p>
                  <p className="mt-1 text-lg font-semibold">{inputQualityScore}</p>
                </div>
                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.qualityProfile}</p>
                  <p className="mt-1 text-lg font-semibold">
                    {Math.round(report.analysis_meta.profile_coverage_pct || 0)}%
                  </p>
                </div>
                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.qualityTier}</p>
                  <p className="mt-1 text-lg font-semibold">{personalizationTierLabel}</p>
                </div>
                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.qualitySignals}</p>
                  <p className="mt-1 text-sm">
                    {report.analysis_meta.wellbeing_signals_count || 0}/6
                  </p>
                </div>
                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.qualityEntries}</p>
                  <p className="mt-1 text-sm">{report.analysis_meta.logged_entry_count || 0}</p>
                </div>
                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.qualityRetry}</p>
                  <p className="mt-1 text-sm">{report.analysis_meta.schema_retry_count || 0}</p>
                </div>
                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.qualitySufficiency}</p>
                  <p className="mt-1 text-sm font-semibold">{dataSufficiency}</p>
                </div>
              </CardContent>
              {lowSignalMode ? (
                <div className="px-6 pb-6">
                  <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-3 text-sm text-amber-900">
                    {t.lowSignalWarning}
                  </div>
                </div>
              ) : null}
            </Card>
          ) : null}

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
              {report.micro_advice?.length ? (
                report.micro_advice.map((item, idx) => (
                  <div key={idx} className="rounded-xl border bg-white/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{item.action}</p>
                      <span className="rounded-full border bg-white/70 px-2 py-1 text-[11px] text-mutedFg">
                        {t.durationMin}: {item.duration_min}m
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-mutedFg">{item.when}</p>
                    <p className="mt-2 text-sm">{item.reason}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-mutedFg">{isKo ? "아직 실행 가이드가 없습니다." : "No micro advice generated yet."}</p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-6">
            <CardHeader>
              <CardTitle>{t.powerHours}</CardTitle>
              <CardDescription>{t.powerHoursDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.productivity_peaks.length ? (
                <>
                  <div className="rounded-xl border bg-white/50 p-3">
                    <div className="relative h-10 rounded-lg bg-[#f4eee6]">
                      {peakTimeline.map((p, idx) => (
                        <div
                          key={`${p.start}-${p.end}-${idx}`}
                          className="absolute top-1/2 h-5 -translate-y-1/2 rounded-md bg-[#d7a86e]/70 ring-1 ring-[#b9803f]/40"
                          style={{ left: `${p.leftPct}%`, width: `${Math.max(p.widthPct, 2)}%` }}
                          title={`${p.start}-${p.end}`}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-mutedFg">
                      <span>00:00</span>
                      <span>12:00</span>
                      <span>23:59</span>
                    </div>
                  </div>
                  {report.productivity_peaks.map((p, idx) => (
                    <div key={idx} className="rounded-xl border bg-white/50 p-4">
                      <p className="text-sm font-semibold">
                        {p.start}–{p.end}
                      </p>
                      <p className="mt-1 text-xs text-mutedFg">{p.reason}</p>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-sm text-mutedFg">{t.noPowerHours}</p>
              )}
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
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={exportCalendar}
                disabled={exporting || !report.tomorrow_routine.length}
                title={isKo ? "Google/Apple 캘린더로 가져올 수 있는 .ics 파일로 내보냅니다" : "Export as .ics for Google Calendar / Apple Calendar"}
              >
                {exporting ? t.exporting : t.exportIcs}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.tomorrow_routine.length ? (
                report.tomorrow_routine.map((it, idx) => (
                  <div key={idx} className="rounded-xl border bg-white/50 p-4">
                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <p className="text-sm font-semibold">
                        {it.start}–{it.end} · {it.activity}
                      </p>
                      <span className="rounded-full border bg-white/70 px-2 py-1 text-[11px] text-mutedFg">
                        {t.goal}: {it.goal}
                      </span>
                    </div>
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
