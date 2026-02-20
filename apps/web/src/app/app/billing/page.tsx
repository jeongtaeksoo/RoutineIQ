"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CreditCard, ShieldCheck, ArrowRight, CheckCircle2 } from "lucide-react";

import { BillingActions } from "@/components/billing-actions";
import { useLocale } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trackProductEvent } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/client";
import { useEntitlements } from "@/lib/use-entitlements";

type BillingEntrySource =
  | "billing"
  | "today"
  | "reports"
  | "plan"
  | "settings"
  | "report_limit"
  | "log";

type BillingEntryContext = {
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
};

function resolveBillingEntrySource(raw: string | null): BillingEntrySource {
  if (
    raw === "today" ||
    raw === "reports" ||
    raw === "plan" ||
    raw === "settings" ||
    raw === "report_limit" ||
    raw === "log"
  ) {
    return raw;
  }
  return "billing";
}

function getBillingEntryContext(source: BillingEntrySource, isKo: boolean): BillingEntryContext | null {
  switch (source) {
    case "report_limit":
      return isKo
        ? {
            title: "오늘 분석 한도에 도달했어요",
            body: "Pro 플랜은 더 높은 일일 분석 한도를 제공해, 기록→분석 루프를 중단 없이 이어갈 수 있어요.",
            actionLabel: "리포트로 돌아가기",
            actionHref: "/app/reports",
          }
        : {
            title: "You reached today's analyze limit",
            body: "Pro gives a higher daily analyze allowance so your log→analyze loop keeps moving.",
            actionLabel: "Back to reports",
            actionHref: "/app/reports",
          };
    case "today":
      return isKo
        ? {
            title: "오늘 루프에서 업그레이드를 검토 중이에요",
            body: "기록/분석/내일 계획 루프의 반복 속도를 높이는 관점에서 플랜을 비교해보세요.",
            actionLabel: "나의 하루로 돌아가기",
            actionHref: "/app/today",
          }
        : {
            title: "You're upgrading from today's loop",
            body: "Compare plans based on how quickly they help you repeat log/analyze/tomorrow cycles.",
            actionLabel: "Back to today",
            actionHref: "/app/today",
          };
    case "reports":
      return isKo
        ? {
            title: "리포트에서 업그레이드 검토 중이에요",
            body: "더 긴 보관 기간과 높은 분석 한도로 회고 품질을 안정적으로 유지할 수 있어요.",
            actionLabel: "리포트로 돌아가기",
            actionHref: "/app/reports",
          }
        : {
            title: "You're upgrading from reports",
            body: "Higher limits and longer retention help keep retrospective quality stable.",
            actionLabel: "Back to reports",
            actionHref: "/app/reports",
          };
    case "plan":
      return isKo
        ? {
            title: "내일 계획 화면에서 왔어요",
            body: "반복 실험 속도와 회고 신뢰도를 기준으로 Pro 가치를 바로 비교하세요.",
            actionLabel: "내일 계획으로 돌아가기",
            actionHref: "/app/plan",
          }
        : {
            title: "You came from tomorrow plan",
            body: "Compare Pro value by iteration speed and review confidence.",
            actionLabel: "Back to tomorrow plan",
            actionHref: "/app/plan",
          };
    case "settings":
      return isKo
        ? {
            title: "설정 화면에서 결제를 열었어요",
            body: "계정/데이터 제어는 유지한 채 플랜만 안전하게 변경할 수 있어요.",
            actionLabel: "설정으로 돌아가기",
            actionHref: "/app/settings/account",
          }
        : {
            title: "You opened billing from settings",
            body: "Change plan safely while keeping account and data controls unchanged.",
            actionLabel: "Back to settings",
            actionHref: "/app/settings/account",
          };
    case "log":
      return isKo
        ? {
            title: "기록 화면에서 업그레이드를 검토 중이에요",
            body: "분석 한도를 늘리면 기록 직후 인사이트 생성 실패를 줄일 수 있어요.",
            actionLabel: "기록 화면으로 돌아가기",
            actionHref: "/app/log",
          }
        : {
            title: "You're upgrading from log flow",
            body: "Higher analyze limits reduce drop-off after logging when insights are needed immediately.",
            actionLabel: "Back to log",
            actionHref: "/app/log",
          };
    default:
      return null;
  }
}

export default function BillingPage() {
  const locale = useLocale();
  const isKo = locale === "ko";
  const { loading: entitlementsLoading, entitlements } = useEntitlements();
  const searchParams = useSearchParams();
  const entrySource = React.useMemo(
    () => resolveBillingEntrySource(searchParams.get("from")),
    [searchParams]
  );
  const entryContext = React.useMemo(
    () => getBillingEntryContext(entrySource, isKo),
    [entrySource, isKo]
  );

  const [loading, setLoading] = React.useState(true);
  const [email, setEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        if (cancelled) return;
        setEmail(user.email || null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    trackProductEvent("billing_page_viewed", {
      source: entrySource,
      meta: { entry_source: entrySource },
    });
  }, [entrySource]);

  React.useEffect(() => {
    if (!entryContext) return;
    trackProductEvent("billing_context_banner_viewed", {
      source: entrySource,
      meta: { entry_source: entrySource, destination: entryContext.actionHref },
    });
  }, [entryContext, entrySource]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="title-serif text-3xl">{isKo ? "요금제/결제" : "Plans & Billing"}</h1>
        <p className="mt-1 text-sm text-mutedFg">
          {isKo
            ? "유료 전환, 결제 상태, 예상 ROI를 한 곳에서 관리합니다."
            : "Manage plan upgrades, billing status, and expected ROI in one place."}
        </p>
      </div>

      {entryContext ? (
        <Card data-testid="billing-entry-context" className="border-brand/25 bg-brand/5">
          <CardHeader>
            <CardTitle>{entryContext.title}</CardTitle>
            <CardDescription>{entryContext.body}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline">
              <Link
                href={entryContext.actionHref}
                onClick={() =>
                  trackProductEvent("billing_context_banner_cta_clicked", {
                    source: entrySource,
                    meta: { entry_source: entrySource, destination: entryContext.actionHref },
                  })
                }
              >
                {entryContext.actionLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-brand/20 shadow-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            {isKo ? "현재 플랜" : "Current Plan"}
          </CardTitle>
          <CardDescription>
            {isKo ? "현재 구독 상태와 업그레이드 동선입니다." : "Your current subscription and upgrade path."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-mutedFg">{isKo ? "불러오는 중..." : "Loading..."}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={entitlements.is_pro ? "default" : "secondary"}>
                {entitlements.is_pro ? "PRO" : "FREE"}
              </Badge>
              <span className="text-sm text-mutedFg">{email || (isKo ? "이메일 미설정" : "No email")}</span>
            </div>
          )}

          <BillingActions
            plan={entitlements.is_pro ? "pro" : "free"}
            needsEmailSetup={entitlements.needs_email_setup || !email}
            localeOverride={locale}
            source={entrySource}
          />
          <div className="rounded-xl border bg-white/60 p-3 text-xs text-mutedFg">
            <p>
              {isKo ? "오늘 분석 사용량" : "Today's analyze usage"}:{" "}
              <span className="font-semibold text-foreground">
                {entitlements.analyze_used_today}/{entitlements.limits.daily_analyze_limit}
              </span>
            </p>
            <p className="mt-1">
              {isKo ? "남은 횟수" : "Remaining today"}:{" "}
              <span className="font-semibold text-foreground">{entitlements.analyze_remaining_today}</span>
            </p>
          </div>
          {entitlementsLoading ? (
            <p className="text-xs text-mutedFg">{isKo ? "권한 상태 동기화 중..." : "Syncing entitlement state..."}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isKo ? "가치 비교" : "Value Comparison"}</CardTitle>
          <CardDescription>
            {isKo
              ? "현재 사용 상태와 업그레이드 시 기대 효과를 한눈에 확인하세요."
              : "Compare your current usage state with expected value after upgrade."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border bg-white/60 p-4">
            <p className="text-sm font-semibold">{isKo ? "현재 플랜 기준" : "Current plan baseline"}</p>
            <ul className="mt-2 space-y-2 text-sm text-mutedFg">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" />
                <span>
                  {isKo ? "일일 분석 한도" : "Daily analyze limit"}:{" "}
                  <span className="font-medium text-foreground">{entitlements.limits.daily_analyze_limit}</span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" />
                <span>
                  {isKo ? "리포트 보관 기간" : "Report retention"}:{" "}
                  <span className="font-medium text-foreground">{entitlements.limits.report_retention_days}</span>{" "}
                  {isKo ? "일" : "days"}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" />
                <span>
                  {isKo ? "오늘 남은 분석" : "Remaining today"}:{" "}
                  <span className="font-medium text-foreground">{entitlements.analyze_remaining_today}</span>
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
            <p className="text-sm font-semibold">{isKo ? "Pro 업그레이드 기대 효과" : "Expected gains with Pro"}</p>
            <ul className="mt-2 space-y-2 text-sm text-mutedFg">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-brand" />
                <span>{isKo ? "더 높은 일일 분석 한도로 반복 실험 속도 향상" : "Higher daily analyze allowance for faster iteration loops"}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-brand" />
                <span>{isKo ? "더 긴 리포트 보관으로 주간/월간 회고 품질 개선" : "Longer report retention for stronger weekly/monthly retrospectives"}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-brand" />
                <span>{isKo ? "결제 실패 시 재시도/지원 링크로 전환 이탈 감소" : "Retry + support recovery path to reduce checkout drop-off"}</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            {isKo ? "결제/계정 운영" : "Billing & Account Operations"}
          </CardTitle>
          <CardDescription>
            {isKo
              ? "민감한 작업은 설정 전용 페이지에서 안전하게 수행하세요."
              : "Use dedicated settings pages for sensitive operations."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Link href="/app/settings/account" className="rounded-xl border bg-white/50 p-4 text-sm transition-colors hover:bg-white/80">
            <p className="font-semibold">{isKo ? "계정 관리" : "Account Management"}</p>
            <p className="mt-1 text-xs text-mutedFg">{isKo ? "이메일/탈퇴 등 계정 작업" : "Email and account deletion controls"}</p>
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-mutedFg">Open <ArrowRight className="h-3 w-3" /></p>
          </Link>

          <Link href="/app/settings/privacy" className="rounded-xl border bg-white/50 p-4 text-sm transition-colors hover:bg-white/80">
            <p className="font-semibold">{isKo ? "데이터 제어" : "Data Control"}</p>
            <p className="mt-1 text-xs text-mutedFg">{isKo ? "데이터 삭제/개인정보 처리" : "Data reset and privacy controls"}</p>
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-mutedFg">Open <ArrowRight className="h-3 w-3" /></p>
          </Link>
        </CardContent>
      </Card>

      <Button asChild variant="outline">
        <Link href="/app/today">{isKo ? "나의 하루로 돌아가기" : "Back to Today"}</Link>
      </Button>
    </div>
  );
}
