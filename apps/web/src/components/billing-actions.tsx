"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import type { Locale } from "@/lib/i18n";
import { isE2ETestMode } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

type BillingCopy = {
  email_required: string;
  password_required: string;
  password_mismatch: string;
  password_min: string;
  convert_failed: string;
  checkout_failed: string;
  on_pro: string;
  checking_billing: string;
  billing_not_ready: string;
  billing_not_ready_button: string;
  needs_email_upgrade: string;
  email: string;
  password: string;
  password_confirm: string;
  creating_account: string;
  create_and_continue: string;
  account_created: string;
  continuing_checkout: string;
  continue_checkout: string;
  redirecting: string;
  start_pro: string;
  estimator_title: string;
  estimator_desc: string;
  minutes_saved: string;
  hourly_value: string;
  monthly_hours: string;
  monthly_value: string;
  payments_note: string;
};

const BILLING_COPY: Record<Locale, BillingCopy> = {
  ko: {
    email_required: "이메일을 입력해주세요",
    password_required: "비밀번호를 입력해주세요",
    password_mismatch: "비밀번호가 일치하지 않습니다",
    password_min: "8자 이상으로 설정해주세요",
    convert_failed: "계정 전환에 실패했습니다",
    checkout_failed: "결제를 시작하지 못했습니다",
    on_pro: "현재 Pro입니다",
    checking_billing: "결제 준비 확인 중...",
    billing_not_ready: "결제는 아직 준비 중입니다. 대신 핵심 기능(기록, AI 분석)은 지금 바로 사용할 수 있어요.",
    billing_not_ready_button: "결제 준비 중",
    needs_email_upgrade: "Pro 결제는 이메일 로그인이 필요합니다. 지금 이메일로 전환하면 기록은 그대로 유지됩니다.",
    email: "이메일",
    password: "비밀번호",
    password_confirm: "비밀번호 확인",
    creating_account: "계정 생성 중...",
    create_and_continue: "계정 만들고 계속하기",
    account_created: "계정이 생성되었습니다. 이제 Pro 결제를 진행할 수 있어요.",
    continuing_checkout: "이동 중...",
    continue_checkout: "결제로 계속하기",
    redirecting: "이동 중...",
    start_pro: "Pro 시작하기",
    estimator_title: "Pro 가치 계산기",
    estimator_desc: "하루에 절약하는 시간과 시간당 가치를 입력해 월간 기대 가치를 계산해 보세요.",
    minutes_saved: "하루 절약 시간(분)",
    hourly_value: "시간당 가치(USD)",
    monthly_hours: "월 예상 확보 시간",
    monthly_value: "월 예상 가치",
    payments_note: "결제는 Stripe를 통해 안전하게 처리됩니다. 결제가 준비되지 않았더라도 핵심 기능은 계속 사용할 수 있어요.",
  },
  en: {
    email_required: "Email is required",
    password_required: "Password is required",
    password_mismatch: "Passwords do not match",
    password_min: "Use at least 8 characters",
    convert_failed: "Account conversion failed",
    checkout_failed: "Failed to start checkout",
    on_pro: "You’re on Pro",
    checking_billing: "Checking billing setup...",
    billing_not_ready: "Billing isn’t configured yet. Core features (logging and AI analysis) still work.",
    billing_not_ready_button: "Payments Coming Soon",
    needs_email_upgrade: "Billing requires an email login. Convert now to keep your data.",
    email: "Email",
    password: "Password",
    password_confirm: "Confirm password",
    creating_account: "Creating account...",
    create_and_continue: "Create account to continue",
    account_created: "Account created. You can now upgrade to Pro.",
    continuing_checkout: "Redirecting...",
    continue_checkout: "Continue to checkout",
    redirecting: "Redirecting...",
    start_pro: "Start Pro",
    estimator_title: "Pro value estimator",
    estimator_desc: "Estimate monthly value by entering daily time saved and your hourly value.",
    minutes_saved: "Minutes saved per day",
    hourly_value: "Hourly value (USD)",
    monthly_hours: "Estimated monthly hours regained",
    monthly_value: "Estimated monthly value",
    payments_note: "Payments are handled securely via Stripe. If billing isn’t configured yet, you can still use core features.",
  },
  ja: {
    email_required: "メールアドレスを入力してください",
    password_required: "パスワードを入力してください",
    password_mismatch: "パスワードが一致しません",
    password_min: "8文字以上で設定してください",
    convert_failed: "アカウント変換に失敗しました",
    checkout_failed: "決済を開始できませんでした",
    on_pro: "現在Proプランです",
    checking_billing: "決済設定を確認中...",
    billing_not_ready: "決済はまだ準備中です。記録とAI分析などの主要機能は引き続き利用できます。",
    billing_not_ready_button: "決済準備中",
    needs_email_upgrade: "Pro決済にはメールログインが必要です。今切り替えても既存データは保持されます。",
    email: "メール",
    password: "パスワード",
    password_confirm: "パスワード確認",
    creating_account: "アカウント作成中...",
    create_and_continue: "アカウントを作成して続行",
    account_created: "アカウントが作成されました。Proへのアップグレードに進めます。",
    continuing_checkout: "移動中...",
    continue_checkout: "決済へ進む",
    redirecting: "リダイレクト中...",
    start_pro: "Proを開始",
    estimator_title: "Pro価値シミュレーター",
    estimator_desc: "1日に節約できる時間と時間単価を入力して、月間の期待価値を試算します。",
    minutes_saved: "1日に節約できる時間（分）",
    hourly_value: "時間単価（USD）",
    monthly_hours: "月間で取り戻せる時間",
    monthly_value: "月間の推定価値",
    payments_note: "決済はStripeで安全に処理されます。決済設定前でも主要機能は利用できます。",
  },
  zh: {
    email_required: "请输入邮箱",
    password_required: "请输入密码",
    password_mismatch: "两次密码不一致",
    password_min: "请使用至少8位密码",
    convert_failed: "账号转换失败",
    checkout_failed: "无法开始结账",
    on_pro: "你当前是 Pro 版本",
    checking_billing: "正在检查计费配置...",
    billing_not_ready: "计费尚未配置完成，但记录和AI分析等核心功能仍可使用。",
    billing_not_ready_button: "计费准备中",
    needs_email_upgrade: "Pro 结账需要邮箱登录。现在转换也会保留你的现有数据。",
    email: "邮箱",
    password: "密码",
    password_confirm: "确认密码",
    creating_account: "正在创建账号...",
    create_and_continue: "创建账号并继续",
    account_created: "账号已创建，现在可以升级到 Pro。",
    continuing_checkout: "跳转中...",
    continue_checkout: "继续结账",
    redirecting: "跳转中...",
    start_pro: "开始 Pro",
    estimator_title: "Pro 价值估算器",
    estimator_desc: "输入每天节省的时间和你的时薪，估算每月可获得的价值。",
    minutes_saved: "每天节省时间（分钟）",
    hourly_value: "时薪价值（USD）",
    monthly_hours: "预计每月找回时间",
    monthly_value: "预计每月价值",
    payments_note: "支付将通过 Stripe 安全处理。即使暂未配置计费，你仍可使用核心功能。",
  },
  es: {
    email_required: "El correo es obligatorio",
    password_required: "La contraseña es obligatoria",
    password_mismatch: "Las contraseñas no coinciden",
    password_min: "Usa al menos 8 caracteres",
    convert_failed: "No se pudo convertir la cuenta",
    checkout_failed: "No se pudo iniciar el pago",
    on_pro: "Ya estás en Pro",
    checking_billing: "Verificando configuración de pagos...",
    billing_not_ready: "La facturación aún no está configurada. Las funciones clave (registro y análisis con IA) siguen disponibles.",
    billing_not_ready_button: "Pagos próximamente",
    needs_email_upgrade: "La facturación requiere inicio de sesión con correo. Conviértelo ahora y conserva tus datos.",
    email: "Correo",
    password: "Contraseña",
    password_confirm: "Confirmar contraseña",
    creating_account: "Creando cuenta...",
    create_and_continue: "Crear cuenta y continuar",
    account_created: "Cuenta creada. Ahora puedes continuar con Pro.",
    continuing_checkout: "Redirigiendo...",
    continue_checkout: "Continuar al pago",
    redirecting: "Redirigiendo...",
    start_pro: "Empezar Pro",
    estimator_title: "Estimador de valor Pro",
    estimator_desc: "Calcula el valor mensual ingresando el tiempo ahorrado por día y tu valor por hora.",
    minutes_saved: "Minutos ahorrados por día",
    hourly_value: "Valor por hora (USD)",
    monthly_hours: "Horas recuperadas al mes",
    monthly_value: "Valor mensual estimado",
    payments_note: "Los pagos se procesan de forma segura con Stripe. Si la facturación no está lista, aún puedes usar las funciones principales.",
  },
};

export function BillingActions({
  plan,
  needsEmailSetup,
  localeOverride,
}: {
  plan: "free" | "pro";
  needsEmailSetup: boolean;
  localeOverride?: Locale;
}) {
  const router = useRouter();
  const contextLocale = useLocale();
  const locale = localeOverride ?? contextLocale;
  const t = BILLING_COPY[locale];
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
      if (!email.trim()) throw new Error(t.email_required);
      if (!password) throw new Error(t.password_required);
      if (password !== password2) throw new Error(t.password_mismatch);
      if (password.length < 8) throw new Error(t.password_min);

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
      setError(err instanceof Error ? err.message : t.convert_failed);
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
      setError(err instanceof Error ? err.message : t.checkout_failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {plan === "pro" ? (
        <Button variant="secondary" disabled>
          {t.on_pro}
        </Button>
      ) : stripeEnabled == null ? (
        <Button variant="outline" disabled>
          {t.checking_billing}
        </Button>
      ) : stripeEnabled === false ? (
        <div className="space-y-2">
          <div className="rounded-xl border bg-white/50 p-3 text-sm text-mutedFg">
            {t.billing_not_ready}
          </div>
          <Button variant="outline" disabled>
            {t.billing_not_ready_button}
          </Button>
        </div>
      ) : needsEmailSetup ? (
        <div className="space-y-3">
          <div className="rounded-xl border bg-white/50 p-3 text-sm text-mutedFg">
            {t.needs_email_upgrade}
          </div>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bill-email">{t.email}</Label>
              <Input id="bill-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-pw">{t.password}</Label>
              <Input id="bill-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-pw2">{t.password_confirm}</Label>
              <Input id="bill-pw2" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
            </div>
          </div>

          <Button onClick={convertToEmailAccount} disabled={loading}>
            {loading ? t.creating_account : t.create_and_continue}
          </Button>

          {converted ? (
            <div className="space-y-2">
              <p className="text-xs text-mutedFg">{t.account_created}</p>
              <Button onClick={upgrade} disabled={loading} data-testid="continue-checkout">
                {loading ? t.continuing_checkout : t.continue_checkout}
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <Button onClick={upgrade} disabled={loading}>
          {loading ? t.redirecting : t.start_pro}
          <ExternalLink className="h-4 w-4" />
        </Button>
      )}
      {plan !== "pro" ? (
        <div className="rounded-xl border bg-white/55 p-3">
          <p className="text-sm font-semibold">{t.estimator_title}</p>
          <p className="mt-1 text-xs text-mutedFg">
            {t.estimator_desc}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="roi-minutes">{t.minutes_saved}</Label>
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
              <Label htmlFor="roi-hourly">{t.hourly_value}</Label>
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
              {t.monthly_hours}:{" "}
              <span className="font-semibold">{monthlyRecoveredHours}h</span>
            </p>
            <p className="mt-1">
              {t.monthly_value}:{" "}
              <span className="font-semibold">${monthlyEstimatedValue}</span>
            </p>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <p className="text-xs text-mutedFg">{t.payments_note}</p>
    </div>
  );
}
