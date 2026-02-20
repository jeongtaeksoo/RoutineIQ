"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowRight, Clock3, Sparkles } from "lucide-react";

import { BillingValueCta } from "@/components/billing-value-cta";
import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trackProductEvent } from "@/lib/analytics";
import { apiFetchWithSchema } from "@/lib/api/validated-fetch";
import { ReportEnvelopeSchema } from "@/lib/api/schemas";
import { localYYYYMMDD } from "@/lib/date-utils";

type TomorrowPlanPreview = {
  date: string;
  report_exists: boolean;
  top_action: string | null;
  first_block: { start: string; end: string; activity: string } | null;
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

export default function PlanPage() {
  const locale = useLocale();
  const isKo = locale === "ko";
  const today = localYYYYMMDD();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<TomorrowPlanPreview | null>(null);
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

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const report = await apiFetchWithSchema(
          `/reports?date=${today}`,
          ReportEnvelopeSchema,
          { timeoutMs: 15_000 },
          "plan report"
        );
        if (cancelled) return;
        setPreview({
          date: report.date,
          report_exists: true,
          top_action: report.report?.coach_one_liner || null,
          first_block: report.report?.tomorrow_routine?.[0] || null,
        });
      } catch {
        if (cancelled) return;
        setPreview({ date: today, report_exists: false, top_action: null, first_block: null });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [today]);

  const roiCopy = React.useMemo(() => {
    if (roiVariant === "outcome") {
      return isKo
        ? {
            title: "3일만 지속해도 체감되는 변화",
            body: "하루 기록과 분석 루프를 3일 유지하면, 내일 계획의 현실성이 높아지고 재시작 시간이 줄어듭니다.",
            cta: "요금제 비교 보기",
          }
        : {
            title: "Noticeable change in 3 days",
            body: "Keep the log-analyze loop for 3 days and tomorrow plans become more realistic with faster recovery after breaks.",
            cta: "Compare plans",
          };
    }
    return isKo
      ? {
          title: "시간 회복 가치를 요금제와 같이 확인하세요",
          body: "분석 한도와 리포트 보관 기간은 반복 실험 속도와 회고 품질에 직접 연결됩니다.",
          cta: "요금제 비교 보기",
        }
      : {
          title: "Compare plan value with recovered time",
          body: "Analyze allowance and report retention directly affect how fast you iterate and how well you review your patterns.",
          cta: "Compare plans",
        };
  }, [isKo, roiVariant]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div>
        <h1 className="title-serif text-3xl">{isKo ? "내일 계획" : "Tomorrow Plan"}</h1>
        <p className="mt-1 text-sm text-mutedFg">
          {isKo
            ? "오늘 데이터로 내일 실행 블록을 빠르게 확인하고 바로 시작하세요."
            : "Review tomorrow routine blocks generated from today and start quickly."}
        </p>
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
          <CardTitle>{isKo ? "내일 시작할 1가지" : "One First Action for Tomorrow"}</CardTitle>
          <CardDescription>
            {isKo ? "부담 없이 시작할 첫 행동을 먼저 정리해요." : "Define the first action you can start without friction."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-mutedFg">{isKo ? "불러오는 중..." : "Loading..."}</p>
          ) : preview?.report_exists ? (
            <div className="space-y-3">
              <div className="rounded-xl border bg-white/60 p-4">
                <p className="text-sm font-semibold">{preview.top_action || (isKo ? "코칭 문장이 아직 없습니다." : "No coach action yet.")}</p>
              </div>
              {preview.first_block ? (
                <div className="rounded-xl border bg-white/60 p-4">
                  <p className="text-xs text-mutedFg">{isKo ? "첫 시작 블록" : "First block"}</p>
                  <p className="mt-1 text-sm font-semibold">
                    {preview.first_block.start}–{preview.first_block.end} · {preview.first_block.activity}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-mutedFg">
                {isKo
                  ? "아직 오늘 리포트가 없습니다. 먼저 기록/분석을 완료하면 내일 계획이 생성됩니다."
                  : "No report for today yet. Complete log/analyze first to generate tomorrow plan."}
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

      <Card>
        <CardHeader>
          <CardTitle>{isKo ? "실행 루프" : "Execution Loop"}</CardTitle>
          <CardDescription>
            {isKo ? "매일 같은 루프로 리텐션과 성과를 만듭니다." : "Use this loop daily to build retention and outcomes."}
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

      <BillingValueCta source="plan" />
    </div>
  );
}
