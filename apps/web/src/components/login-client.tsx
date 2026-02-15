"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Globe, Mail } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

type LangKey = "ko" | "en" | "ja" | "zh" | "es";

const LANG_LABELS: Record<LangKey, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "中文",
  es: "Español",
};

const T: Record<
  LangKey,
  {
    welcome: string;
    welcomeSub: string;
    tabLogin: string;
    tabSignup: string;
    email: string;
    password: string;
    login: string;
    loggingIn: string;
    signUp: string;
    signingUp: string;
    forgotPassword: string;
    or: string;
    googleLogin: string;
    googleSignup: string;
    googleUnavailable: string;
    googleSetupHint: string;
    back: string;
    privacy: string;
    signupSuccess: string;
    signupRedirect: string;
    resetSent: string;
    noEmailYet: string;
    supabaseTitle: string;
    supabaseSub: string;
  }
> = {
  ko: {
    welcome: "다시 오셨군요",
    welcomeSub: "편안한 속도로 이어가세요.",
    tabLogin: "로그인",
    tabSignup: "회원가입",
    email: "이메일",
    password: "비밀번호",
    login: "로그인",
    loggingIn: "로그인 중...",
    signUp: "가입하기",
    signingUp: "가입 중...",
    forgotPassword: "비밀번호를 잊으셨나요?",
    or: "또는",
    googleLogin: "Google로 로그인",
    googleSignup: "Google로 가입",
    googleUnavailable: "Google 로그인이 아직 활성화되지 않았습니다. 이메일 로그인으로 진행해 주세요.",
    googleSetupHint: "Supabase Dashboard > Auth > Providers > Google에서 활성화할 수 있습니다.",
    back: "돌아가기",
    privacy: "개인정보는 루틴 분석에만 사용됩니다.",
    signupSuccess: "가입 완료! 이메일을 확인해 주세요.",
    signupRedirect: "가입 완료! 이동합니다...",
    resetSent: "재설정 메일을 보냈습니다. 메일함을 확인해 주세요.",
    noEmailYet: "이메일을 먼저 입력해 주세요.",
    supabaseTitle: "환경 설정 필요",
    supabaseSub: "Supabase 환경변수를 설정하고 서버를 재시작해 주세요.",
  },
  en: {
    welcome: "Welcome back",
    welcomeSub: "Continue at your own pace.",
    tabLogin: "Sign in",
    tabSignup: "Sign up",
    email: "Email",
    password: "Password",
    login: "Sign in",
    loggingIn: "Signing in...",
    signUp: "Create account",
    signingUp: "Creating...",
    forgotPassword: "Forgot password?",
    or: "or",
    googleLogin: "Sign in with Google",
    googleSignup: "Sign up with Google",
    googleUnavailable: "Google login is not enabled yet. Please continue with email login.",
    googleSetupHint: "Enable it in Supabase Dashboard > Auth > Providers > Google.",
    back: "Back",
    privacy: "Your data is used only for routine analysis.",
    signupSuccess: "Account created! Please check your email.",
    signupRedirect: "Account created! Redirecting...",
    resetSent: "Reset email sent. Please check your inbox.",
    noEmailYet: "Please enter your email first.",
    supabaseTitle: "Setup required",
    supabaseSub: "Set Supabase environment variables and restart the server.",
  },
  ja: {
    welcome: "おかえりなさい",
    welcomeSub: "あなたのペースで続けてください。",
    tabLogin: "ログイン",
    tabSignup: "新規登録",
    email: "メールアドレス",
    password: "パスワード",
    login: "ログイン",
    loggingIn: "ログイン中...",
    signUp: "アカウント作成",
    signingUp: "作成中...",
    forgotPassword: "パスワードを忘れた場合",
    or: "または",
    googleLogin: "Googleでログイン",
    googleSignup: "Googleで登録",
    googleUnavailable: "Googleログインはまだ有効化されていません。メールログインで続行してください。",
    googleSetupHint: "Supabase Dashboard > Auth > Providers > Google で有効化できます。",
    back: "戻る",
    privacy: "個人情報はルーティン分析にのみ使用されます。",
    signupSuccess: "登録完了！メールをご確認ください。",
    signupRedirect: "登録完了！移動します...",
    resetSent: "リセットメールを送信しました。受信箱をご確認ください。",
    noEmailYet: "まずメールアドレスを入力してください。",
    supabaseTitle: "設定が必要です",
    supabaseSub: "Supabase環境変数を設定してサーバーを再起動してください。",
  },
  zh: {
    welcome: "欢迎回来",
    welcomeSub: "按照自己的节奏继续。",
    tabLogin: "登录",
    tabSignup: "注册",
    email: "电子邮件",
    password: "密码",
    login: "登录",
    loggingIn: "登录中...",
    signUp: "创建账户",
    signingUp: "创建中...",
    forgotPassword: "忘记密码？",
    or: "或",
    googleLogin: "使用 Google 登录",
    googleSignup: "使用 Google 注册",
    googleUnavailable: "Google 登录尚未启用，请先使用邮箱登录。",
    googleSetupHint: "可在 Supabase Dashboard > Auth > Providers > Google 启用。",
    back: "返回",
    privacy: "个人信息仅用于习惯分析。",
    signupSuccess: "注册成功！请查看您的邮箱。",
    signupRedirect: "注册成功！正在跳转...",
    resetSent: "重置邮件已发送，请检查收件箱。",
    noEmailYet: "请先输入您的电子邮件。",
    supabaseTitle: "需要设置",
    supabaseSub: "请设置Supabase环境变量并重启服务器。",
  },
  es: {
    welcome: "Bienvenido de nuevo",
    welcomeSub: "Continúa a tu propio ritmo.",
    tabLogin: "Iniciar sesión",
    tabSignup: "Registrarse",
    email: "Correo electrónico",
    password: "Contraseña",
    login: "Iniciar sesión",
    loggingIn: "Iniciando...",
    signUp: "Crear cuenta",
    signingUp: "Creando...",
    forgotPassword: "¿Olvidaste tu contraseña?",
    or: "o",
    googleLogin: "Iniciar con Google",
    googleSignup: "Registrarse con Google",
    googleUnavailable: "El acceso con Google aún no está habilitado. Continúa con correo electrónico.",
    googleSetupHint: "Actívalo en Supabase Dashboard > Auth > Providers > Google.",
    back: "Volver",
    privacy: "Tus datos se usan solo para analizar rutinas.",
    signupSuccess: "Cuenta creada. Revisa tu correo.",
    signupRedirect: "Cuenta creada. Redirigiendo...",
    resetSent: "Correo de restablecimiento enviado. Revisa tu bandeja.",
    noEmailYet: "Primero ingresa tu correo electrónico.",
    supabaseTitle: "Configuración necesaria",
    supabaseSub: "Configura las variables de entorno de Supabase y reinicia el servidor.",
  },
};

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84Z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#EA4335" />
    </svg>
  );
}

function safeOriginFromEnv(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLocalhostHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function resolveAuthOrigin(): string {
  const configuredSiteOrigin = safeOriginFromEnv(process.env.NEXT_PUBLIC_SITE_URL) || "https://rutineiq.com";
  if (typeof window === "undefined") return configuredSiteOrigin;
  const origin = window.location.origin;
  const hostname = window.location.hostname.toLowerCase();

  if (isLocalhostHost(hostname)) {
    return origin;
  }

  // Always use the configured production site origin for hosted sessions.
  // This avoids OAuth falling back to Supabase SITE_URL (which may still point to localhost).
  return configuredSiteOrigin;
}

function setPostAuthRedirectCookie(nextPath: string): void {
  if (typeof document === "undefined") return;
  const safeNext = nextPath.startsWith("/") ? nextPath : "/app/insights";
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `routineiq_post_auth_next=${encodeURIComponent(safeNext)}; Path=/; Max-Age=600; SameSite=Lax${secure}`;
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [lang, setLang] = React.useState<LangKey>("ko");
  const [langOpen, setLangOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"login" | "signup">("login");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [googleEnabled, setGoogleEnabled] = React.useState(true);

  const t = T[lang];
  const redirectedFrom = searchParams.get("redirectedFrom");
  const afterAuthRedirect = redirectedFrom && redirectedFrom.startsWith("/") ? redirectedFrom : "/app/insights";
  const supabaseEnv = getSupabasePublicEnv();

  React.useEffect(() => {
    if (!supabaseEnv.configured || !supabaseEnv.url || !supabaseEnv.anonKey) return;
    const anonKey = supabaseEnv.anonKey;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${supabaseEnv.url}/auth/v1/settings`, {
          headers: { apikey: anonKey },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { external?: { google?: boolean } };
        if (!cancelled) setGoogleEnabled(Boolean(data?.external?.google));
      } catch {
        // Keep default state when settings endpoint is temporarily unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabaseEnv.anonKey, supabaseEnv.configured, supabaseEnv.url]);

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseEnv.configured) return;
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace(afterAuthRedirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseEnv.configured) return;
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) {
        setMessage(t.signupRedirect);
        router.replace(afterAuthRedirect);
      } else {
        setMessage(t.signupSuccess);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  async function sendPasswordReset() {
    setError(null);
    setMessage(null);
    if (!email.trim()) {
      setError(t.noEmailYet);
      return;
    }
    setLoading(true);
    try {
      const authOrigin = resolveAuthOrigin();
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${authOrigin}/reset-password`,
      });
      if (error) throw error;
      setMessage(t.resetSent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    if (!supabaseEnv.configured) return;
    if (!googleEnabled) {
      setError(t.googleUnavailable);
      return;
    }
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const authOrigin = resolveAuthOrigin();
      setPostAuthRedirectCookie(afterAuthRedirect);
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${authOrigin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Google login failed";
      if (msg.toLowerCase().includes("unsupported provider")) {
        setError(t.googleUnavailable);
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  }

  if (!supabaseEnv.configured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#faf8f5] px-6">
        <div className="w-full max-w-md rounded-2xl border border-[#e8e4de] bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-[#3d3a36]" style={{ fontFamily: "var(--font-serif)" }}>
            {t.supabaseTitle}
          </h1>
          <p className="mt-2 text-sm text-[#8a8480]">{t.supabaseSub}</p>
          <div className="mt-6 rounded-xl border border-[#e8e4de] bg-[#faf8f5] p-4 text-left">
            <div className="space-y-1 font-mono text-xs text-[#6b6560]">
              <div>NEXT_PUBLIC_SUPABASE_URL=...</div>
              <div>NEXT_PUBLIC_SUPABASE_ANON_KEY=...</div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#faf8f5] px-6 py-10">
      {langOpen ? <div className="fixed inset-0 z-20" onClick={() => setLangOpen(false)} /> : null}

      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-[#8a8480] transition-colors hover:text-[#3d3a36]">
            <ArrowLeft className="h-4 w-4" />
            {t.back}
          </Link>
          <div className="relative">
            <button
              onClick={() => setLangOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-full border border-[#e8e4de] bg-white/70 px-3 py-1.5 text-xs text-[#6b6560] transition-all hover:border-[#c5bfb7]"
            >
              <Globe className="h-3.5 w-3.5" />
              {LANG_LABELS[lang]}
            </button>
            {langOpen ? (
              <div className="absolute right-0 top-full z-30 mt-1 w-32 overflow-hidden rounded-xl border border-[#e8e4de] bg-white shadow-lg">
                {(Object.keys(LANG_LABELS) as LangKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => {
                      setLang(k);
                      setLangOpen(false);
                    }}
                    className={`block w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#f5f2ee] ${
                      k === lang ? "bg-[#f5f2ee] font-medium text-[#3d3a36]" : "text-[#6b6560]"
                    }`}
                  >
                    {LANG_LABELS[k]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-[#e8e4de] bg-white p-8 shadow-sm">
          <div className="mb-8 text-center">
            <Link href="/" className="text-2xl font-semibold text-[#3d3a36]" style={{ fontFamily: "var(--font-serif)" }}>
              RutineIQ
            </Link>
            <p className="mt-2 text-sm text-[#8a8480]">{tab === "login" ? t.welcome : t.welcomeSub}</p>
            <p className="mt-0.5 text-xs text-[#b5b0a9]">{tab === "login" ? t.welcomeSub : ""}</p>
          </div>

          <div className="mb-6 flex rounded-xl bg-[#f5f2ee] p-1">
            {(["login", "signup"] as const).map((tabKey) => (
              <button
                key={tabKey}
                onClick={() => {
                  setTab(tabKey);
                  setError(null);
                  setMessage(null);
                }}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                  tab === tabKey ? "bg-white text-[#3d3a36] shadow-sm" : "text-[#8a8480] hover:text-[#6b6560]"
                }`}
              >
                {tabKey === "login" ? t.tabLogin : t.tabSignup}
              </button>
            ))}
          </div>

          {message ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-sm text-emerald-800">{message}</div> : null}
          {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50/80 p-3 text-sm text-red-800">{error}</div> : null}

          <button
            onClick={signInWithGoogle}
            disabled={loading || !googleEnabled}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#e8e4de] bg-white py-3 text-sm font-medium text-[#3d3a36] transition-all hover:bg-[#f5f2ee] hover:shadow-sm disabled:opacity-50"
          >
            <GoogleIcon className="h-5 w-5" />
            {tab === "login" ? t.googleLogin : t.googleSignup}
          </button>
          {!googleEnabled ? <p className="mt-2 text-xs text-[#9b7a4a]">{t.googleSetupHint}</p> : null}

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#e8e4de]" />
            <span className="text-xs text-[#b5b0a9]">{t.or}</span>
            <div className="h-px flex-1 bg-[#e8e4de]" />
          </div>

          <form className="space-y-4" onSubmit={tab === "login" ? signInWithPassword : signUp}>
            <div className="space-y-1.5">
              <Label htmlFor="login-email" className="text-xs text-[#6b6560]">
                {t.email}
              </Label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="rounded-xl border-[#e8e4de] bg-[#faf8f5] focus:border-[#3d3a36] focus:ring-[#3d3a36]/10"
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password" className="text-xs text-[#6b6560]">
                {t.password}
              </Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="rounded-xl border-[#e8e4de] bg-[#faf8f5] focus:border-[#3d3a36] focus:ring-[#3d3a36]/10"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3d3a36] py-3 text-sm font-medium text-white transition-all hover:bg-[#2a2826] disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              {tab === "login" ? (loading ? t.loggingIn : t.login) : loading ? t.signingUp : t.signUp}
            </button>

            {tab === "login" ? (
              <button
                type="button"
                onClick={sendPasswordReset}
                disabled={loading}
                className="w-full text-center text-xs text-[#b5b0a9] transition-colors hover:text-[#6b6560] disabled:opacity-50"
              >
                {t.forgotPassword}
              </button>
            ) : null}
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-[#c5bfb7]">{t.privacy}</p>
      </div>
    </main>
  );
}
