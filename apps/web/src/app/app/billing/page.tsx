import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingActions } from "@/components/billing-actions";
import { createClient } from "@/lib/supabase/server";

export default async function BillingPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const meta = (user?.user_metadata as any) || {};
  const isKo = meta["routineiq_locale"] !== "en";

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan,status,current_period_end,cancel_at_period_end")
    .eq("user_id", user?.id || "")
    .maybeSingle();

  const plan = sub?.plan === "pro" && (sub.status === "active" || sub.status === "trialing") ? "pro" : "free";
  const isGuest = !user?.email;
  const periodEnd = sub?.current_period_end ? String(sub.current_period_end).slice(0, 10) : "-";
  const showCancel = Boolean(sub?.cancel_at_period_end);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="title-serif text-3xl">{isKo ? "요금제/결제" : "Plans & Billing"}</h1>
        <p className="mt-1 text-sm text-mutedFg">
          {isKo
            ? "핵심 루프는 Free로도 충분히 체험할 수 있어요. Pro는 더 자주 분석해 내일 계획을 현실에 맞게 빠르게 다듬습니다."
            : "Free is enough to try the core loop. Pro lets you iterate more and refine tomorrow’s plan faster."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{isKo ? "Free (Starter)" : "Free (Starter)"}</CardTitle>
            <CardDescription>
              {isKo ? "오늘을 정리하고, 내일 계획을 한 번 만들어보세요." : "Summarize today once, and get a first tomorrow plan."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="title-serif text-3xl">{isKo ? "무료" : "$0"}</div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-mutedFg">
              <li>{isKo ? "AI 분석: 하루 1회까지" : "AI analyze: up to 1/day"}</li>
              <li>{isKo ? "리포트 보관: 3일" : "Report retention: 3 days"}</li>
              <li>{isKo ? "내일 스케줄 + 코치 한 줄" : "Tomorrow schedule + one-line coach tip"}</li>
            </ul>
            {plan === "free" ? (
              <div className="rounded-lg border bg-white/50 p-3 text-sm text-fg">{isKo ? "현재 플랜" : "Current plan"}</div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isKo ? "Pro (Growth)" : "Pro (Growth)"}</CardTitle>
            <CardDescription>
              {isKo
                ? "하루 중간에도 다시 분석해, 계획을 현실에 맞게 수정합니다."
                : "Re-run analysis through the day to keep your plan realistic."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="title-serif text-3xl">{isKo ? "₩6,900/월" : "$4.99/mo"}</div>
            <p className="text-xs text-mutedFg">{isKo ? "또는 $4.99/월" : "Or ₩6,900/mo (KR)"}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-mutedFg">
              <li>{isKo ? "AI 분석: 하루 10회까지" : "AI analyze: up to 10/day"}</li>
              <li>{isKo ? "리포트 보관: 30일" : "Report retention: 30 days"}</li>
              <li>{isKo ? "실패 패턴(최대 3개) + 해결책 더 구체화" : "Up to 3 failure patterns + more specific fixes"}</li>
              <li>{isKo ? "우선 처리(재시도 포함)" : "Priority handling (with retries)"}</li>
            </ul>
            <BillingActions plan={plan} isGuest={isGuest} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isKo ? "안심 포인트" : "Trust & Safety"}</CardTitle>
          <CardDescription>
            {isKo ? "과장 없이, 구체적으로 안내합니다." : "Specific, no-hype assurances."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-mutedFg">
          <ul className="list-disc space-y-1 pl-5">
            <li>{isKo ? "언제든 해지할 수 있어요(다음 결제일 전까지는 그대로 사용)." : "Cancel anytime (keeps access until the next renewal)."}</li>
            <li>{isKo ? "결제는 Stripe를 통해 안전하게 처리됩니다(카드 정보는 RoutineIQ 서버에 저장되지 않음)." : "Payments are handled by Stripe (we don’t store card details on our servers)."}</li>
            <li>{isKo ? "데이터는 개인 루틴 최적화에만 사용하며, 광고/판매 목적 사용은 없습니다." : "Your data is used only to personalize your routine (no ads, no selling)."}</li>
          </ul>
        </CardContent>
      </Card>

      <details className="group">
        <summary className="cursor-pointer list-none rounded-xl border bg-white/55 px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-white/70">
          {isKo ? "내 결제 상태 보기" : "View my billing status"}
          <span className="ml-2 text-xs font-normal text-mutedFg">
            {isKo ? "(필요할 때만 펼치기)" : "(expand when needed)"}
          </span>
        </summary>
        <div className="mt-3">
          <Card>
            <CardHeader>
              <CardTitle>{isKo ? "결제 상태" : "Billing Status"}</CardTitle>
              <CardDescription>
                {isKo ? "결제 후 자동으로 반영됩니다." : "Automatically updated after checkout."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg border bg-white/50 p-3">
                <span className="text-mutedFg">{isKo ? "현재 플랜" : "Current plan"}</span>
                <span className="font-semibold">{plan === "pro" ? "pro" : "free"}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-white/50 p-3">
                <span className="text-mutedFg">{isKo ? "상태" : "Status"}</span>
                <span className="font-semibold">{sub?.status || "none"}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-white/50 p-3">
                <span className="text-mutedFg">{isKo ? "다음 결제일" : "Next renewal"}</span>
                <span className="font-semibold">{periodEnd}</span>
              </div>
              {showCancel ? (
                <div className="rounded-lg border bg-white/50 p-3 text-xs text-mutedFg">
                  {isKo
                    ? "해지 예약이 설정되어 있습니다. 기간 종료일까지는 Pro 혜택을 사용할 수 있어요."
                    : "Cancellation is scheduled. You’ll keep Pro benefits until period end."}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </details>
    </div>
  );
}
