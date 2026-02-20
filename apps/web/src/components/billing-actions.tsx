"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trackProductEvent } from "@/lib/analytics";
import { apiFetch, isApiFetchError } from "@/lib/api-client";
import type { Locale } from "@/lib/i18n";
import { isE2ETestMode } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

type BillingCopy = {
  email_required: string;
  email_invalid: string;
  password_required: string;
  password_mismatch: string;
  password_min: string;
  convert_failed: string;
  checkout_failed: string;
  checkout_timeout: string;
  checkout_network: string;
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
  retry_checkout: string;
  contact_support: string;
  error_reference: string;
  redirecting: string;
  start_pro: string;
  estimator_title: string;
  estimator_desc: string;
  minutes_saved: string;
  hourly_value: string;
  monthly_hours: string;
  monthly_value: string;
  payments_note: string;
  email_rule: string;
  password_rule: string;
  password_match_rule: string;
};

const BILLING_COPY: Record<Locale, BillingCopy> = {
  ko: {
    email_required: "이메일을 입력해주세요",
    email_invalid: "올바른 이메일 형식으로 입력해주세요",
    password_required: "비밀번호를 입력해주세요",
    password_mismatch: "비밀번호가 일치하지 않습니다",
    password_min: "8자 이상으로 설정해주세요",
    convert_failed: "계정 전환에 실패했습니다",
    checkout_failed: "결제를 시작하지 못했습니다",
    checkout_timeout: "결제 준비 시간이 초과되었습니다. 다시 시도해 주세요.",
    checkout_network: "네트워크 연결이 불안정합니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.",
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
    retry_checkout: "결제 다시 시도",
    contact_support: "지원팀에 문의",
    error_reference: "오류 참조 ID",
    redirecting: "이동 중...",
    start_pro: "Pro 시작하기",
    estimator_title: "Pro 가치 계산기",
    estimator_desc: "하루에 절약하는 시간과 시간당 가치를 입력해 월간 기대 가치를 계산해 보세요.",
    minutes_saved: "하루 절약 시간(분)",
    hourly_value: "시간당 가치(USD)",
    monthly_hours: "월 예상 확보 시간",
    monthly_value: "월 예상 가치",
    payments_note: "결제는 Stripe를 통해 안전하게 처리됩니다. 결제가 준비되지 않았더라도 핵심 기능은 계속 사용할 수 있어요.",
    email_rule: "이메일 형식 입력",
    password_rule: "비밀번호 8자 이상",
    password_match_rule: "비밀번호 일치",
  },
  en: {
    email_required: "Email is required",
    email_invalid: "Enter a valid email address",
    password_required: "Password is required",
    password_mismatch: "Passwords do not match",
    password_min: "Use at least 8 characters",
    convert_failed: "Account conversion failed",
    checkout_failed: "Failed to start checkout",
    checkout_timeout: "Checkout setup timed out. Please retry.",
    checkout_network: "Network connection looks unstable. Please check your connection and retry.",
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
    retry_checkout: "Retry checkout",
    contact_support: "Contact support",
    error_reference: "Error reference",
    redirecting: "Redirecting...",
    start_pro: "Start Pro",
    estimator_title: "Pro value estimator",
    estimator_desc: "Estimate monthly value by entering daily time saved and your hourly value.",
    minutes_saved: "Minutes saved per day",
    hourly_value: "Hourly value (USD)",
    monthly_hours: "Estimated monthly hours regained",
    monthly_value: "Estimated monthly value",
    payments_note: "Payments are handled securely via Stripe. If billing isn’t configured yet, you can still use core features.",
    email_rule: "Use valid email format",
    password_rule: "At least 8 characters",
    password_match_rule: "Passwords match",
  },
  ja: {
    email_required: "メールアドレスを入力してください",
    email_invalid: "有効なメールアドレス形式で入力してください",
    password_required: "パスワードを入力してください",
    password_mismatch: "パスワードが一致しません",
    password_min: "8文字以上で設定してください",
    convert_failed: "アカウント変換に失敗しました",
    checkout_failed: "決済を開始できませんでした",
    checkout_timeout: "決済準備がタイムアウトしました。再度お試しください。",
    checkout_network: "ネットワーク接続が不安定です。接続を確認して再試行してください。",
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
    retry_checkout: "決済を再試行",
    contact_support: "サポートに連絡",
    error_reference: "エラー参照ID",
    redirecting: "リダイレクト中...",
    start_pro: "Proを開始",
    estimator_title: "Pro価値シミュレーター",
    estimator_desc: "1日に節約できる時間と時間単価を入力して、月間の期待価値を試算します。",
    minutes_saved: "1日に節約できる時間（分）",
    hourly_value: "時間単価（USD）",
    monthly_hours: "月間で取り戻せる時間",
    monthly_value: "月間の推定価値",
    payments_note: "決済はStripeで安全に処理されます。決済設定前でも主要機能は利用できます。",
    email_rule: "メール形式を入力",
    password_rule: "8文字以上のパスワード",
    password_match_rule: "パスワード一致",
  },
  zh: {
    email_required: "请输入邮箱",
    email_invalid: "请输入正确的邮箱格式",
    password_required: "请输入密码",
    password_mismatch: "两次密码不一致",
    password_min: "请使用至少8位密码",
    convert_failed: "账号转换失败",
    checkout_failed: "无法开始结账",
    checkout_timeout: "结账准备超时，请重试。",
    checkout_network: "网络连接不稳定，请检查后重试。",
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
    retry_checkout: "重试结账",
    contact_support: "联系支持",
    error_reference: "错误参考 ID",
    redirecting: "跳转中...",
    start_pro: "开始 Pro",
    estimator_title: "Pro 价值估算器",
    estimator_desc: "输入每天节省的时间和你的时薪，估算每月可获得的价值。",
    minutes_saved: "每天节省时间（分钟）",
    hourly_value: "时薪价值（USD）",
    monthly_hours: "预计每月找回时间",
    monthly_value: "预计每月价值",
    payments_note: "支付将通过 Stripe 安全处理。即使暂未配置计费，你仍可使用核心功能。",
    email_rule: "使用有效邮箱格式",
    password_rule: "密码至少8位",
    password_match_rule: "两次密码一致",
  },
  es: {
    email_required: "El correo es obligatorio",
    email_invalid: "Ingresa un correo válido",
    password_required: "La contraseña es obligatoria",
    password_mismatch: "Las contraseñas no coinciden",
    password_min: "Usa al menos 8 caracteres",
    convert_failed: "No se pudo convertir la cuenta",
    checkout_failed: "No se pudo iniciar el pago",
    checkout_timeout: "La preparación del pago excedió el tiempo. Inténtalo de nuevo.",
    checkout_network: "La conexión de red es inestable. Verifica tu red e inténtalo de nuevo.",
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
    retry_checkout: "Reintentar pago",
    contact_support: "Contactar soporte",
    error_reference: "ID de referencia",
    redirecting: "Redirigiendo...",
    start_pro: "Empezar Pro",
    estimator_title: "Estimador de valor Pro",
    estimator_desc: "Calcula el valor mensual ingresando el tiempo ahorrado por día y tu valor por hora.",
    minutes_saved: "Minutos ahorrados por día",
    hourly_value: "Valor por hora (USD)",
    monthly_hours: "Horas recuperadas al mes",
    monthly_value: "Valor mensual estimado",
    payments_note: "Los pagos se procesan de forma segura con Stripe. Si la facturación no está lista, aún puedes usar las funciones principales.",
    email_rule: "Usa formato de correo válido",
    password_rule: "Mínimo 8 caracteres",
    password_match_rule: "Las contraseñas coinciden",
  },
};

type CheckoutFailureInfo = {
  message: string;
  correlationId?: string;
};

function normalizeCheckoutError(err: unknown, t: BillingCopy): CheckoutFailureInfo {
  const lowered = err instanceof Error ? err.message.toLowerCase() : "";
  const correlationId = isApiFetchError(err) ? err.correlationId : undefined;
  if (isApiFetchError(err) && (err.code === "timeout" || err.status === 504)) {
    return { message: t.checkout_timeout, correlationId };
  }
  if (
    lowered.includes("failed to fetch") ||
    lowered.includes("network request failed") ||
    lowered.includes("networkerror")
  ) {
    return { message: t.checkout_network, correlationId };
  }
  return {
    message: err instanceof Error ? err.message : t.checkout_failed,
    correlationId,
  };
}

export function BillingActions({
  plan,
  needsEmailSetup,
  localeOverride,
  source = "billing",
}: {
  plan: "free" | "pro";
  needsEmailSetup: boolean;
  localeOverride?: Locale;
  source?: "billing" | "today" | "reports" | "plan" | "settings" | "report_limit" | "log";
}) {
  const router = useRouter();
  const contextLocale = useLocale();
  const locale = localeOverride ?? contextLocale;
  const t = BILLING_COPY[locale];
  const supportEmail = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@rutineiq.com").trim();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [checkoutFailure, setCheckoutFailure] = React.useState<CheckoutFailureInfo | null>(null);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [password2, setPassword2] = React.useState("");
  const [converted, setConverted] = React.useState(false);
  const [stripeEnabled, setStripeEnabled] = React.useState<boolean | null>(null);
  const [minutesRecovered, setMinutesRecovered] = React.useState<number>(20);
  const [hourlyValue, setHourlyValue] = React.useState<number>(25);
  const normalizedEmail = email.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const passwordValid = password.length >= 8;
  const passwordMatched = password2.length > 0 && password === password2;
  const canConvert = emailValid && passwordValid && passwordMatched && !loading;
  const monthlyRecoveredHours = React.useMemo(() => Math.round((minutesRecovered * 30) / 60), [minutesRecovered]);
  const monthlyEstimatedValue = React.useMemo(
    () => Math.round(monthlyRecoveredHours * hourlyValue),
    [hourlyValue, monthlyRecoveredHours],
  );
  const supportHref = React.useMemo(() => {
    const subject = "RutineIQ billing checkout issue";
    const lines = [
      "Hi RutineIQ support,",
      "",
      "I couldn't start checkout.",
      `Plan: ${plan.toUpperCase()}`,
      `Entry source: ${source}`,
      checkoutFailure?.correlationId ? `Correlation ID: ${checkoutFailure.correlationId}` : null,
      "",
      "Please help me recover this checkout flow.",
    ].filter(Boolean);
    const params = new URLSearchParams({
      subject,
      body: lines.join("\n"),
    });
    return `mailto:${supportEmail}?${params.toString()}`;
  }, [checkoutFailure?.correlationId, plan, source, supportEmail]);

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
    setCheckoutFailure(null);
    setLoading(true);
    trackProductEvent("billing_email_convert_started", {
      source,
      meta: { needs_email_setup: true, entry_source: source },
    });
    try {
      if (!normalizedEmail) throw new Error(t.email_required);
      if (!emailValid) throw new Error(t.email_invalid);
      if (!password) throw new Error(t.password_required);
      if (password !== password2) throw new Error(t.password_mismatch);
      if (password.length < 8) throw new Error(t.password_min);

      if (isE2ETestMode()) {
        setConverted(true);
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ email: normalizedEmail, password });
      if (error) throw error;

      setConverted(true);
      trackProductEvent("billing_email_convert_succeeded", {
        source,
        meta: { entry_source: source },
      });
      router.refresh();
    } catch (err) {
      trackProductEvent("billing_email_convert_failed", {
        source,
        meta: { message: err instanceof Error ? err.message : "unknown_error", entry_source: source },
      });
      setError(err instanceof Error ? err.message : t.convert_failed);
    } finally {
      setLoading(false);
    }
  }

  async function upgrade() {
    setError(null);
    setCheckoutFailure(null);
    setLoading(true);
    trackProductEvent("billing_checkout_started", { source, meta: { entry_source: source } });
    try {
      const billingSource = (source || "billing").toString().trim().toLowerCase().slice(0, 32) || "billing";
      const res = await apiFetch<{ url: string }>(`/stripe/create-checkout-session`, {
        method: "POST",
        headers: { "x-routineiq-billing-source": billingSource },
      });
      trackProductEvent("billing_checkout_redirected", { source, meta: { entry_source: source } });
      window.location.href = res.url;
    } catch (err) {
      const normalized = normalizeCheckoutError(err, t);
      trackProductEvent("billing_checkout_failed", {
        source,
        meta: {
          message: err instanceof Error ? err.message : "unknown_error",
          correlation_id: normalized.correlationId || null,
          status: isApiFetchError(err) ? err.status ?? null : null,
          code: isApiFetchError(err) ? err.code ?? null : null,
          entry_source: source,
        },
      });
      setError(normalized.message);
      setCheckoutFailure(normalized);
    } finally {
      setLoading(false);
    }
  }

  // Visual validity hints reduce trial-and-error in the conversion step.
  function ruleClass(ok: boolean): string {
    return ok ? "text-emerald-700" : "text-mutedFg";
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

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canConvert) return;
              void convertToEmailAccount();
            }}
          >
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

            <div className="space-y-1 rounded-lg border bg-white/60 p-3 text-xs">
              <p data-testid="billing-rule-email" className={ruleClass(emailValid)}>{t.email_rule}</p>
              <p data-testid="billing-rule-password" className={ruleClass(passwordValid)}>{t.password_rule}</p>
              <p data-testid="billing-rule-match" className={ruleClass(passwordMatched)}>{t.password_match_rule}</p>
            </div>

            <Button type="submit" disabled={!canConvert} data-testid="create-account-continue">
              {loading ? t.creating_account : t.create_and_continue}
            </Button>
          </form>

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
      {error ? (
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/80 p-3">
          <p className="text-sm text-red-700">{error}</p>
          {checkoutFailure?.correlationId ? (
            <p className="text-xs text-red-700/90">
              {t.error_reference}: <span className="font-mono">{checkoutFailure.correlationId}</span>
            </p>
          ) : null}
          {checkoutFailure ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={upgrade} disabled={loading}>
                {t.retry_checkout}
              </Button>
              <a
                href={supportHref}
                className="text-xs text-red-800 underline underline-offset-2"
                onClick={() =>
                    trackProductEvent("billing_cta_clicked", {
                    source: "billing_support",
                    meta: { correlation_id: checkoutFailure.correlationId || null, entry_source: source },
                  })
                }
              >
                {t.contact_support}
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-mutedFg">{t.payments_note}</p>
    </div>
  );
}
