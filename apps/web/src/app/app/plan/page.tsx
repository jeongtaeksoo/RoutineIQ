"use client";

import Link from "next/link";
import * as React from "react";
import { AlertTriangle, ArrowRight, Clock3, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";

import { BillingValueCta } from "@/components/billing-value-cta";
import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trackProductEvent } from "@/lib/analytics";
import { formatApiErrorMessage } from "@/lib/api-error";
import { isApiFetchError } from "@/lib/api-client";
import { ReportEnvelopeSchema } from "@/lib/api/schemas";
import { apiFetchWithSchema } from "@/lib/api/validated-fetch";
import { localYYYYMMDD } from "@/lib/date-utils";
import { normalizeReport, type AIReport } from "@/lib/report-utils";
import { cn } from "@/lib/utils";

type TomorrowBlock = {
  start: string;
  end: string;
  activity: string;
  goal: string;
};

type PlanQuality = {
  inputQuality: number;
  profileCoverage: number;
  loggedEntries: number;
  retryCount: number;
};

type TomorrowPlanPreview = {
  date: string;
  reportExists: boolean;
  summary: string | null;
  topAction: string | null;
  firstBlock: TomorrowBlock | null;
  blocks: TomorrowBlock[];
  riskPattern: { pattern: string; trigger: string; fix: string } | null;
  recoveryRule: { if: string; then: string } | null;
  microAdvice: { action: string; when: string; reason: string; durationMin: number } | null;
  weeklySignal: string | null;
  quality: PlanQuality | null;
};

type RoiVariant = "control" | "outcome";

const ROI_VARIANT_STORAGE_KEY = "routineiq:plan:roi-variant:v1";

function resolveRoiVariant(): RoiVariant {
  if (typeof window === "undefined") return "control";
  try {
    const saved = window.localStorage.getItem(ROI_VARIANT_STORAGE_KEY);
    if (saved === "control" || saved === "outcome") return saved;
    const next: RoiVariant = Math.random() < 0.5 ? "control" : "outcome";
    window.localStorage.setItem(ROI_VARIANT_STORAGE_KEY, next);
    return next;
  } catch {
    return "control";
  }
}

function toNumber(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function createEmptyPreview(date: string): TomorrowPlanPreview {
  return {
    date,
    reportExists: false,
    summary: null,
    topAction: null,
    firstBlock: null,
    blocks: [],
    riskPattern: null,
    recoveryRule: null,
    microAdvice: null,
    weeklySignal: null,
    quality: null,
  };
}

function buildPreview(date: string, report: AIReport | null): TomorrowPlanPreview {
  if (!report) return createEmptyPreview(date);
  const blocks = Array.isArray(report.tomorrow_routine) ? report.tomorrow_routine : [];
  const firstBlock = blocks[0] || null;
  const quality =
    report.analysis_meta && typeof report.analysis_meta === "object"
      ? {
          inputQuality: Math.round(toNumber(report.analysis_meta.input_quality_score)),
          profileCoverage: Math.round(toNumber(report.analysis_meta.profile_coverage_pct)),
          loggedEntries: Math.round(toNumber(report.analysis_meta.logged_entry_count)),
          retryCount: Math.round(toNumber(report.analysis_meta.schema_retry_count)),
        }
      : null;
  const firstAdvice = report.micro_advice?.[0];
  return {
    date,
    reportExists: true,
    summary: report.summary || null,
    topAction: report.coach_one_liner || null,
    firstBlock: firstBlock
      ? {
          start: firstBlock.start,
          end: firstBlock.end,
          activity: firstBlock.activity,
          goal: firstBlock.goal,
        }
      : null,
    blocks: blocks.slice(0, 6).map((block) => ({
      start: block.start,
      end: block.end,
      activity: block.activity,
      goal: block.goal,
    })),
    riskPattern: report.failure_patterns?.[0] || null,
    recoveryRule: report.if_then_rules?.[0] || null,
    microAdvice: firstAdvice
      ? {
          action: firstAdvice.action,
          when: firstAdvice.when,
          reason: firstAdvice.reason,
          durationMin: firstAdvice.duration_min,
        }
      : null,
    weeklySignal: report.weekly_pattern_insight || null,
    quality,
  };
}

function qualityTier(quality: PlanQuality | null): "strong" | "mid" | "low" {
  if (!quality) return "low";
  if (quality.inputQuality >= 70 && quality.profileCoverage >= 75 && quality.loggedEntries >= 3) return "strong";
  if (quality.inputQuality >= 40 && quality.loggedEntries >= 2) return "mid";
  return "low";
}

export default function PlanPage() {
  const locale = useLocale();
  const isKo = locale === "ko";
  const today = localYYYYMMDD();

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<TomorrowPlanPreview>(() => createEmptyPreview(today));
  const [roiVariant, setRoiVariant] = React.useState<RoiVariant>("control");

  React.useEffect(() => {
    setRoiVariant(resolveRoiVariant());
  }, []);

  React.useEffect(() => {
    trackProductEvent("plan_roi_variant_viewed", {
      source: "plan",
      meta: { variant: roiVariant },
    });
  }, [roiVariant]);

  const loadPreview = React.useCallback(
    async (opts?: { background?: boolean }) => {
      const background = Boolean(opts?.background);
      if (background) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const response = await apiFetchWithSchema(
          `/reports?date=${today}`,
          ReportEnvelopeSchema,
          { timeoutMs: 15_000 },
          "plan report"
        );
        const normalized = normalizeReport(response.report, isKo);
        setPreview(buildPreview(response.date, normalized));
      } catch (err) {
        if (isApiFetchError(err) && err.status === 404) {
          setPreview(createEmptyPreview(today));
          return;
        }
        setPreview(createEmptyPreview(today));
        setError(
          formatApiErrorMessage(err, {
            fallbackMessage: isKo ? "내일 계획 데이터를 불러오지 못했어요." : "Failed to load tomorrow plan data.",
            includeHint: true,
            includeReference: true,
            referenceLabel: isKo ? "오류 참조 ID" : "Error reference",
          })
        );
      } finally {
        if (background) setRefreshing(false);
        else setLoading(false);
      }
    },
    [isKo, today]
  );

  React.useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const roiCopy = React.useMemo(() => {
    if (roiVariant === "outcome") {
      return isKo
        ? {
            title: "3일만 지속해도 체감되는 변화",
            body: "하루 기록+분석 루프를 3일 유지하면, 내일 계획의 현실성이 올라가고 재시작 시간이 줄어듭니다.",
            cta: "요금제 비교 보기",
          }
        : {
            title: "Noticeable change in 3 days",
            body: "Keep the log-analyze loop for 3 days and tomorrow plans become more realistic with faster recovery.",
            cta: "Compare plans",
          };
    }
    return isKo
      ? {
          title: "회복한 시간을 요금제와 함께 비교하세요",
          body: "분석 한도와 리포트 보관 기간은 반복 실험 속도와 회고 정확도에 직접 연결됩니다.",
          cta: "요금제 비교 보기",
        }
      : {
          title: "Compare plan value with recovered time",
          body: "Analyze allowance and retention windows directly affect iteration speed and review quality.",
          cta: "Compare plans",
        };
  }, [isKo, roiVariant]);

  const tier = qualityTier(preview.quality);
  const tierBadgeClass =
    tier === "strong"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tier === "mid"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-rose-200 bg-rose-50 text-rose-800";
  const tierLabel = isKo
    ? tier === "strong"
      ? "실행 준비도 높음"
      : tier === "mid"
        ? "실행 준비도 보통"
        : "실행 준비도 낮음"
    : tier === "strong"
      ? "Execution readiness: high"
      : tier === "mid"
        ? "Execution readiness: medium"
        : "Execution readiness: low";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="title-serif text-3xl">{isKo ? "내일 계획" : "Tomorrow Plan"}</h1>
          <p className="mt-1 text-sm text-mutedFg">
            {isKo
              ? "냉정하게 보면 계획 탭은 실행 가능성만 보여줘야 합니다. 내일 첫 블록부터 바로 시작할 수 있게 정리했어요."
              : "Tomorrow plan should prove execution readiness, not just show text. Start from the first block."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadPreview({ background: true })} disabled={loading || refreshing}>
          <RefreshCw className={cn("h-4 w-4", refreshing ? "animate-spin" : "")} />
          {refreshing ? (isKo ? "갱신 중..." : "Refreshing...") : isKo ? "다시 불러오기" : "Refresh"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      ) : null}

      <Card className="border-brand/30 bg-brand/5">
        <CardHeader>
          <CardTitle>{roiCopy.title}</CardTitle>
          <CardDescription>{roiCopy.body}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link
              href="/app/billing?from=plan"
              onClick={() =>
                trackProductEvent("plan_roi_cta_clicked", {
                  source: "plan",
                  meta: { variant: roiVariant },
                })
              }
            >
              {roiCopy.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-brand/20 shadow-elevated">
        <CardHeader>
          <CardTitle>{isKo ? "내일 실행 캔버스" : "Tomorrow Execution Canvas"}</CardTitle>
          <CardDescription>
            {isKo
              ? "핵심 행동, 첫 블록, 리스크 복귀 규칙을 한 번에 확인하세요."
              : "Review one key action, first block, and fallback rule in one canvas."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : preview.reportExists ? (
            <>
              <div className="rounded-xl border bg-white/70 p-4">
                <p className="text-xs text-mutedFg">{isKo ? "핵심 행동" : "Key action"}</p>
                <p className="mt-1 text-sm font-semibold">
                  {preview.topAction || (isKo ? "핵심 행동이 아직 없어 리포트 문장을 사용해 시작하세요." : "No key action yet. Start from report summary.")}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-white/60 p-4">
                  <p className="text-xs text-mutedFg">{isKo ? "첫 시작 블록" : "First block"}</p>
                  <p className="mt-1 text-sm font-semibold">
                    {preview.firstBlock
                      ? `${preview.firstBlock.start}–${preview.firstBlock.end} · ${preview.firstBlock.activity}`
                      : isKo
                        ? "아직 블록이 없어 리포트에서 내일 흐름을 생성해 주세요."
                        : "No block yet. Generate tomorrow routine from report."}
                  </p>
                  {preview.firstBlock?.goal ? (
                    <p className="mt-2 text-xs text-mutedFg">{isKo ? `실행 포인트: ${preview.firstBlock.goal}` : `Action point: ${preview.firstBlock.goal}`}</p>
                  ) : null}
                </div>
                <div className="rounded-xl border bg-white/60 p-4">
                  <p className="text-xs text-mutedFg">{isKo ? "요약" : "Summary"}</p>
                  <p className="mt-1 text-sm">{preview.summary || (isKo ? "요약 데이터가 아직 없습니다." : "Summary is not available yet.")}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-mutedFg">
                {isKo
                  ? "지금 상태로는 내일 계획 탭이 비어 보입니다. 먼저 오늘 기록과 분석을 1회 완료해 계획 데이터 기반을 만들어주세요."
                  : "Tomorrow plan is thin without today’s log/analyze. Complete one cycle first."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/app/log">
                    <Clock3 className="h-4 w-4" />
                    {isKo ? "기록하러 가기" : "Go to Log"}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/app/reports">
                    <Sparkles className="h-4 w-4" />
                    {isKo ? "리포트 열기" : "Open Report"}
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>{isKo ? "실행 준비도" : "Execution Readiness"}</CardTitle>
            <CardDescription>
              {isKo ? "데이터 품질이 낮으면 계획은 보수적으로 제시됩니다." : "Low data quality forces conservative planning."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-28 w-full rounded-xl" />
            ) : preview.quality ? (
              <>
                <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", tierBadgeClass)}>{tierLabel}</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border bg-white/60 p-3">
                    <p className="text-[11px] text-mutedFg">{isKo ? "기록 완성도" : "Input quality"}</p>
                    <p className="mt-0.5 text-sm font-semibold">{preview.quality.inputQuality}/100</p>
                  </div>
                  <div className="rounded-lg border bg-white/60 p-3">
                    <p className="text-[11px] text-mutedFg">{isKo ? "프로필 완성도" : "Profile coverage"}</p>
                    <p className="mt-0.5 text-sm font-semibold">{preview.quality.profileCoverage}%</p>
                  </div>
                  <div className="rounded-lg border bg-white/60 p-3">
                    <p className="text-[11px] text-mutedFg">{isKo ? "분석 반영 기록" : "Entries analyzed"}</p>
                    <p className="mt-0.5 text-sm font-semibold">{isKo ? `${preview.quality.loggedEntries}개` : `${preview.quality.loggedEntries}`}</p>
                  </div>
                  <div className="rounded-lg border bg-white/60 p-3">
                    <p className="text-[11px] text-mutedFg">{isKo ? "분석 안정성" : "Analysis stability"}</p>
                    <p className="mt-0.5 text-sm font-semibold">
                      {preview.quality.retryCount === 0 ? (isKo ? "안정" : "Stable") : isKo ? `재시도 ${preview.quality.retryCount}회` : `Retries ${preview.quality.retryCount}`}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-mutedFg">
                {isKo ? "아직 준비도 지표를 계산할 데이터가 없습니다." : "Not enough data yet to calculate readiness metrics."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>{isKo ? "리스크 대비 + 복귀 규칙" : "Risk Guard + Recovery Rule"}</CardTitle>
            <CardDescription>
              {isKo ? "흔들리는 지점 하나와 복귀 규칙 하나만 정해도 실행률이 올라갑니다." : "One risk and one fallback rule can meaningfully improve execution."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border bg-white/60 p-4">
              <p className="text-xs text-mutedFg">{isKo ? "우선 대비할 리스크" : "Primary risk to guard"}</p>
              {preview.riskPattern ? (
                <>
                  <p className="mt-1 text-sm font-semibold">{preview.riskPattern.pattern}</p>
                  <p className="mt-1 text-xs text-mutedFg">{isKo ? `원인: ${preview.riskPattern.trigger}` : `Trigger: ${preview.riskPattern.trigger}`}</p>
                  <p className="mt-2 text-sm">
                    <span className="font-semibold">{isKo ? "대응:" : "Fix:"}</span> {preview.riskPattern.fix}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-mutedFg">{isKo ? "리스크 패턴 데이터가 아직 없습니다." : "No risk pattern data yet."}</p>
              )}
            </div>
            <div className="rounded-xl border bg-white/60 p-4">
              <p className="text-xs text-mutedFg">{isKo ? "복귀 규칙" : "Recovery rule"}</p>
              {preview.recoveryRule ? (
                <>
                  <p className="mt-1 text-sm">
                    <span className="font-semibold">IF:</span> {preview.recoveryRule.if}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="font-semibold">THEN:</span> {preview.recoveryRule.then}
                  </p>
                </>
              ) : preview.microAdvice ? (
                <>
                  <p className="mt-1 text-sm font-semibold">{preview.microAdvice.action}</p>
                  <p className="mt-1 text-xs text-mutedFg">{preview.microAdvice.when}</p>
                  <p className="mt-2 text-sm">{preview.microAdvice.reason}</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-mutedFg">{isKo ? "복귀 규칙 데이터가 아직 없습니다." : "No recovery rule data yet."}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isKo ? "내일 블록 미리보기" : "Tomorrow Blocks Preview"}</CardTitle>
          <CardDescription>
            {isKo ? "첫 3~4개 블록만 확실히 지키는 것이 현실적인 전략입니다." : "Protecting the first 3-4 blocks is usually the most realistic strategy."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <>
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </>
          ) : preview.blocks.length ? (
            <>
              {preview.blocks.slice(0, 4).map((block, index) => (
                <div key={`${block.start}-${block.end}-${index}`} className="rounded-xl border bg-white/60 p-4">
                  <p className="text-sm font-semibold">
                    {block.start}–{block.end} · {block.activity}
                  </p>
                  <p className="mt-1 text-xs text-mutedFg">{isKo ? `실행 포인트: ${block.goal}` : `Action point: ${block.goal}`}</p>
                </div>
              ))}
              {preview.blocks.length > 4 ? (
                <p className="text-xs text-mutedFg">
                  {isKo ? `+ ${preview.blocks.length - 4}개 블록은 리포트 전체보기에서 확인하세요.` : `+ ${preview.blocks.length - 4} more blocks in full report.`}
                </p>
              ) : null}
              <Button asChild variant="outline" size="sm">
                <Link href={`/app/reports/${preview.date}`}>
                  {isKo ? "리포트 전체보기" : "Open full report"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
              <p className="font-semibold">{isKo ? "계획 블록이 아직 비어 있습니다." : "Plan blocks are still empty."}</p>
              <p className="mt-1">
                {isKo
                  ? "오늘 로그+분석을 먼저 한 번 완료하면 내일 블록이 자동 생성됩니다."
                  : "Complete one log+analyze cycle today to generate tomorrow blocks."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isKo ? "실행 루프" : "Execution Loop"}</CardTitle>
          <CardDescription>
            {isKo ? "루프를 고정하면 리텐션이 올라갑니다. (기록 → 분석 → 계획 → 실행)" : "Retention improves when this loop is consistent: log → analyze → plan → execute."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {[
            { labelKo: "오늘 기록", labelEn: "Log Today", href: "/app/log" },
            { labelKo: "AI 분석", labelEn: "Analyze", href: "/app/reports" },
            { labelKo: "내일 계획", labelEn: "Tomorrow Plan", href: "/app/plan" },
            { labelKo: "실행 및 복귀", labelEn: "Execute & Return", href: "/app/today" },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="rounded-xl border bg-white/50 p-4 text-sm transition-colors hover:bg-white/80">
              <p className="font-semibold">{isKo ? item.labelKo : item.labelEn}</p>
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-mutedFg">
                {isKo ? "열기" : "Open"}
                <ArrowRight className="h-3 w-3" />
              </p>
            </Link>
          ))}
        </CardContent>
      </Card>

      {preview.weeklySignal ? (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="flex items-start gap-3 p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-700" />
            <div>
              <p className="text-xs font-semibold text-emerald-900">{isKo ? "주간 신호" : "Weekly signal"}</p>
              <p className="mt-1 text-sm text-emerald-900">{preview.weeklySignal}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
            <div>
              <p className="text-xs font-semibold text-amber-900">{isKo ? "패턴 데이터 보강 필요" : "Pattern data still thin"}</p>
              <p className="mt-1 text-sm text-amber-900">
                {isKo
                  ? "내일 계획의 정확도를 높이려면 2~3일 연속으로 짧게라도 기록해 주세요."
                  : "Log consistently for 2-3 days to improve tomorrow-plan precision."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <BillingValueCta source="plan" />
    </div>
  );
}

