"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import { isE2ETestMode } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

export function BillingActions({ plan, needsEmailSetup }: { plan: "free" | "pro"; needsEmailSetup: boolean }) {
  const router = useRouter();
  const locale = useLocale();
  const isKo = locale === "ko";
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [password2, setPassword2] = React.useState("");
  const [converted, setConverted] = React.useState(false);
  const [stripeEnabled, setStripeEnabled] = React.useState<boolean | null>(null);
  const [minutesRecovered, setMinutesRecovered] = React.useState<number>(20);
  const [hourlyValue, setHourlyValue] = React.useState<number>(25);
  const monthlyRecoveredHours = React.useMemo(() => Math.round((minutesRecovered * 30) / 60), [minutesRecovered]);
  const monthlyEstimatedValue = React.useMemo(
    () => Math.round(monthlyRecoveredHours * hourlyValue),
    [hourlyValue, monthlyRecoveredHours],
  );

  React.useEffect(() => {
    if (plan === "pro") {
      // No need to check Stripe setup if the user is already on Pro.
      setStripeEnabled(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ enabled: boolean }>(`/stripe/status`);
        if (!cancelled) setStripeEnabled(Boolean(res.enabled));
      } catch {
        // If backend is unreachable or endpoint is disabled, treat as not enabled.
        if (!cancelled) setStripeEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan]);

  async function convertToEmailAccount() {
    setError(null);
    setLoading(true);
    try {
      if (!email.trim()) throw new Error(isKo ? "이메일을 입력해주세요" : "Email is required");
      if (!password) throw new Error(isKo ? "비밀번호를 입력해주세요" : "Password is required");
      if (password !== password2) throw new Error(isKo ? "비밀번호가 일치하지 않습니다" : "Passwords do not match");
      if (password.length < 8) throw new Error(isKo ? "8자 이상으로 설정해주세요" : "Use at least 8 characters");

      if (isE2ETestMode()) {
        setConverted(true);
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ email: email.trim(), password });
      if (error) throw error;

      setConverted(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : isKo ? "계정 전환에 실패했습니다" : "Account conversion failed");
    } finally {
      setLoading(false);
    }
  }

  async function upgrade() {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ url: string }>(`/stripe/create-checkout-session`, { method: "POST" });
      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : isKo ? "결제를 시작하지 못했습니다" : "Failed to start checkout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {plan === "pro" ? (
        <Button variant="secondary" disabled>
          {isKo ? "현재 Pro입니다" : "You’re on Pro"}
        </Button>
      ) : stripeEnabled == null ? (
        <Button variant="outline" disabled>
          {isKo ? "결제 준비 확인 중..." : "Checking billing setup..."}
        </Button>
      ) : stripeEnabled === false ? (
        <div className="space-y-2">
          <div className="rounded-xl border bg-white/50 p-3 text-sm text-mutedFg">
            {isKo
              ? "결제는 아직 준비 중입니다. 대신 핵심 기능(기록, AI 분석)은 지금 바로 사용할 수 있어요."
              : "Billing isn’t configured yet. Core features (logging and AI analysis) still work."}
          </div>
          <Button variant="outline" disabled>
            {isKo ? "결제 준비 중" : "Payments Coming Soon"}
          </Button>
        </div>
      ) : needsEmailSetup ? (
        <div className="space-y-3">
          <div className="rounded-xl border bg-white/50 p-3 text-sm text-mutedFg">
            {isKo
              ? "Pro 결제는 이메일 로그인이 필요합니다. 지금 이메일로 전환하면 기록은 그대로 유지됩니다."
              : "Billing requires an email login. Convert now to keep your data."}
          </div>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bill-email">{isKo ? "이메일" : "Email"}</Label>
              <Input id="bill-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-pw">{isKo ? "비밀번호" : "Password"}</Label>
              <Input id="bill-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-pw2">{isKo ? "비밀번호 확인" : "Confirm password"}</Label>
              <Input id="bill-pw2" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
            </div>
          </div>

          <Button onClick={convertToEmailAccount} disabled={loading}>
            {loading ? (isKo ? "계정 생성 중..." : "Creating account...") : isKo ? "계정 만들고 계속하기" : "Create account to continue"}
          </Button>

          {converted ? (
            <div className="space-y-2">
              <p className="text-xs text-mutedFg">
                {isKo ? "계정이 생성되었습니다. 이제 Pro 결제를 진행할 수 있어요." : "Account created. You can now upgrade to Pro."}
              </p>
              <Button onClick={upgrade} disabled={loading} data-testid="continue-checkout">
                {loading ? (isKo ? "이동 중..." : "Redirecting...") : isKo ? "결제로 계속하기" : "Continue to checkout"}
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <Button onClick={upgrade} disabled={loading}>
          {loading ? (isKo ? "이동 중..." : "Redirecting...") : isKo ? "Pro 시작하기" : "Start Pro"}
          <ExternalLink className="h-4 w-4" />
        </Button>
      )}
      {plan !== "pro" ? (
        <div className="rounded-xl border bg-white/55 p-3">
          <p className="text-sm font-semibold">
            {isKo ? "Pro 가치 계산기" : "Pro value estimator"}
          </p>
          <p className="mt-1 text-xs text-mutedFg">
            {isKo
              ? "하루에 절약하는 시간과 시간당 가치를 입력해 월간 기대 가치를 계산해 보세요."
              : "Estimate monthly value by entering daily time saved and your hourly value."}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="roi-minutes">{isKo ? "하루 절약 시간(분)" : "Minutes saved per day"}</Label>
              <Input
                id="roi-minutes"
                type="number"
                min={0}
                max={240}
                value={minutesRecovered}
                onChange={(e) => setMinutesRecovered(Math.max(0, Math.min(240, Number(e.target.value) || 0)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="roi-hourly">{isKo ? "시간당 가치(USD)" : "Hourly value (USD)"}</Label>
              <Input
                id="roi-hourly"
                type="number"
                min={1}
                max={500}
                value={hourlyValue}
                onChange={(e) => setHourlyValue(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              />
            </div>
          </div>
          <div className="mt-3 rounded-lg border bg-white/70 p-3 text-sm">
            <p>
              {isKo ? "월 예상 확보 시간" : "Estimated monthly hours regained"}:{" "}
              <span className="font-semibold">{monthlyRecoveredHours}h</span>
            </p>
            <p className="mt-1">
              {isKo ? "월 예상 가치" : "Estimated monthly value"}:{" "}
              <span className="font-semibold">${monthlyEstimatedValue}</span>
            </p>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <p className="text-xs text-mutedFg">
        {isKo
          ? "결제는 Stripe를 통해 안전하게 처리됩니다. 결제가 준비되지 않았더라도 핵심 기능은 계속 사용할 수 있어요."
          : "Payments are handled securely via Stripe. If billing isn’t configured yet, you can still use core features."}
      </p>
    </div>
  );
}
