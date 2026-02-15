"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import type { Locale } from "@/lib/i18n";

const MESSAGES: Record<Locale, Record<string, string>> = {
  en: {
    title: "Preferences",
    subtitle: "Customize your experience.",
    lang_title: "Language",
    lang_desc: "Select your preferred language.",
    save: "Save",
    saved_lang: "Language saved.",
    saved_reminders: "Reminders saved.",
    notif_title: "Notification Settings",
    notif_desc: "Get browser notifications to stay on track.",
    enable_reminders: "Enable Reminders",
    enable_desc: "Requires browser to be open on PC.",
    evening_check: "Evening check-in",
    morning_check: "Morning plan check",
    check_perm: "Check permissions",
    perm_on: "On",
    perm_off: "Off",
    perm_needed: "Setup needed",
    perm_unsupported: "Unsupported",
    privacy_title: "Data & Privacy",
    privacy_desc: "Transparent data usage.",
    privacy_p1: "Logs are used only for your routine analysis.",
    privacy_p2: "No ads, no data selling.",
    privacy_p3: "You can delete your data anytime.",
    reset_data: "Reset all data",
    reset_confirm: "Delete all logs and reports? This cannot be undone.",
    reset_complete: "Data reset complete.",
    login_required: "Not signed in",
    delete_failed: "Delete failed",
    save_failed: "Failed to save",
    req_failed: "Request failed",
    notif_enabled: "Notifications enabled.",
    notif_denied: "Notifications denied.",
    notif_unsupported: "Notifications not supported"
  },
  ko: {
    title: "환경설정",
    subtitle: "나에게 맞는 앱 환경을 설정합니다.",
    lang_title: "언어",
    lang_desc: "앱에서 사용할 언어를 선택하세요.",
    save: "저장",
    saved_lang: "언어 설정이 변경되었습니다.",
    saved_reminders: "리마인더 설정이 저장되었습니다.",
    notif_title: "알림 설정",
    notif_desc: "루틴을 놓치지 않도록 브라우저 알림을 받습니다.",
    enable_reminders: "리마인더 켜기",
    enable_desc: "PC에서는 브라우저가 열려있어야 알림이 옵니다.",
    evening_check: "저녁: 하루 기록하기",
    morning_check: "아침: 계획 확인하기",
    check_perm: "브라우저 권한 확인",
    perm_on: "알림 켜짐",
    perm_off: "알림 꺼짐",
    perm_needed: "설정 필요",
    perm_unsupported: "미지원",
    privacy_title: "데이터 및 프라이버시",
    privacy_desc: "내 정보가 어떻게 쓰이는지 투명하게 공개합니다.",
    privacy_p1: "작성한 기록은 오직 나만의 루틴 분석에만 사용됩니다.",
    privacy_p2: "광고나 판매 목적으로 사용되지 않으니 안심하세요.",
    privacy_p3: "언제든지 모든 데이터를 삭제할 수 있습니다.",
    reset_data: "데이터 전체 초기화",
    reset_confirm: "모든 기록과 리포트를 삭제할까요? 삭제된 데이터는 복구할 수 없습니다.",
    reset_complete: "데이터가 초기화되었습니다.",
    login_required: "로그인이 필요합니다",
    delete_failed: "삭제 실패",
    save_failed: "저장에 실패했습니다",
    req_failed: "권한 요청 실패",
    notif_enabled: "알림이 켜졌습니다.",
    notif_denied: "알림이 거부되었습니다.",
    notif_unsupported: "이 브라우저는 알림을 지원하지 않습니다"
  },
  ja: {
    title: "設定",
    subtitle: "アプリの環境設定を行います。",
    lang_title: "言語",
    lang_desc: "アプリで使用する言語を選択してください。",
    save: "保存",
    saved_lang: "言語設定を保存しました。",
    saved_reminders: "リマインダー設定を保存しました。",
    notif_title: "通知設定",
    notif_desc: "ルーチンを逃さないようにブラウザ通知を受け取ります。",
    enable_reminders: "リマインダーを有効にする",
    enable_desc: "PCではブラウザが開いている必要があります。",
    evening_check: "夜：一日の記録",
    morning_check: "朝：計画を確認",
    check_perm: "権限を確認",
    perm_on: "オン",
    perm_off: "オフ",
    perm_needed: "設定が必要",
    perm_unsupported: "非対応",
    privacy_title: "データとプライバシー",
    privacy_desc: "データの使用方法について。",
    privacy_p1: "ログはルーチン分析にのみ使用されます。",
    privacy_p2: "広告や販売には使用されません。",
    privacy_p3: "いつでもデータを削除できます。",
    reset_data: "データをリセット",
    reset_confirm: "すべてのログとレポートを削除しますか？この操作は取り消せません。",
    reset_complete: "データがリセットされました。",
    login_required: "ログインが必要です",
    delete_failed: "削除に失敗しました",
    save_failed: "保存に失敗しました",
    req_failed: "リクエストに失敗しました",
    notif_enabled: "通知が有効になりました。",
    notif_denied: "通知が拒否されました。",
    notif_unsupported: "このブラウザは通知に対応していません"
  },
  zh: {
    title: "设置",
    subtitle: "自定义您的体验。",
    lang_title: "语言",
    lang_desc: "选择您想要使用的语言。",
    save: "保存",
    saved_lang: "语言设置已保存。",
    saved_reminders: "提醒设置已保存。",
    notif_title: "通知设置",
    notif_desc: "接收浏览器通知以保持进度。",
    enable_reminders: "启用提醒",
    enable_desc: "需要在PC上打开浏览器。",
    evening_check: "晚间：记录一天",
    morning_check: "早晨：检查计划",
    check_perm: "检查权限",
    perm_on: "已开启",
    perm_off: "已关闭",
    perm_needed: "需要设置",
    perm_unsupported: "不支持",
    privacy_title: "数据与隐私",
    privacy_desc: "数据使用透明化。",
    privacy_p1: "日志仅用于您的日常分析。",
    privacy_p2: "无广告，不出售数据。",
    privacy_p3: "您可以随时删除数据。",
    reset_data: "重置所有数据",
    reset_confirm: "删除所有日志和报告吗？此操作无法撤销。",
    reset_complete: "数据已重置。",
    login_required: "未登录",
    delete_failed: "删除失败",
    save_failed: "保存失败",
    req_failed: "请求失败",
    notif_enabled: "通知已启用。",
    notif_denied: "通知被拒绝。",
    notif_unsupported: "此浏览器不支持通知"
  },
  es: {
    title: "Preferencias",
    subtitle: "Personaliza tu experiencia.",
    lang_title: "Idioma",
    lang_desc: "Selecciona tu idioma preferido.",
    save: "Guardar",
    saved_lang: "Idioma guardado.",
    saved_reminders: "Recordatorios guardados.",
    notif_title: "Configuración de notificaciones",
    notif_desc: "Recibe notificaciones del navegador para mantener el rumbo.",
    enable_reminders: "Activar recordatorios",
    enable_desc: "Requiere que el navegador esté abierto en PC.",
    evening_check: "Noche: registrar tu día",
    morning_check: "Mañana: revisar plan",
    check_perm: "Comprobar permisos",
    perm_on: "Activado",
    perm_off: "Desactivado",
    perm_needed: "Requiere config",
    perm_unsupported: "No soportado",
    privacy_title: "Datos y Privacidad",
    privacy_desc: "Uso de datos transparente.",
    privacy_p1: "Los registros solo se usan para tu análisis de rutina.",
    privacy_p2: "Sin anuncios, no comercializamos datos.",
    privacy_p3: "Puedes borrar tus datos cuando quieras.",
    reset_data: "Restablecer datos",
    reset_confirm: "¿Eliminar todos los registros y reportes? Esto no se puede deshacer.",
    reset_complete: "Datos restablecidos.",
    login_required: "No has iniciado sesión",
    delete_failed: "Error al eliminar",
    save_failed: "Error al guardar",
    req_failed: "Solicitud fallida",
    notif_enabled: "Notificaciones activadas.",
    notif_denied: "Notificaciones denegadas.",
    notif_unsupported: "Notificaciones no soportadas"
  }
};

type CompareDimension = "age_group" | "gender" | "job_family" | "work_mode";
type ProfilePreferences = {
  age_group: "0_17" | "18_24" | "25_34" | "35_44" | "45_plus" | "unknown";
  gender: "female" | "male" | "nonbinary" | "prefer_not_to_say" | "unknown";
  job_family: "office_worker" | "professional" | "creator" | "student" | "self_employed" | "other" | "unknown";
  work_mode: "fixed" | "flex" | "shift" | "freelance" | "other" | "unknown";
  trend_opt_in: boolean;
  trend_compare_by: CompareDimension[];
  goal_keyword: string | null;
  goal_minutes_per_day: number | null;
};

const DEFAULT_PROFILE: ProfilePreferences = {
  age_group: "unknown",
  gender: "unknown",
  job_family: "unknown",
  work_mode: "unknown",
  trend_opt_in: false,
  trend_compare_by: ["age_group", "job_family", "work_mode"],
  goal_keyword: null,
  goal_minutes_per_day: 90,
};

const AGE_OPTIONS = [
  { value: "0_17", ko: "0-17세", en: "0-17" },
  { value: "18_24", ko: "18-24세", en: "18-24" },
  { value: "25_34", ko: "25-34세", en: "25-34" },
  { value: "35_44", ko: "35-44세", en: "35-44" },
  { value: "45_plus", ko: "45세+", en: "45+" },
  { value: "unknown", ko: "선택하세요 (필수)", en: "Select one (required)" },
] as const;

const GENDER_OPTIONS = [
  { value: "female", ko: "여성", en: "Female" },
  { value: "male", ko: "남성", en: "Male" },
  { value: "nonbinary", ko: "논바이너리", en: "Non-binary" },
  { value: "prefer_not_to_say", ko: "응답 안함", en: "Prefer not to say" },
  { value: "unknown", ko: "선택하세요 (필수)", en: "Select one (required)" },
] as const;

const JOB_OPTIONS = [
  { value: "office_worker", ko: "회사원/사무직", en: "Office Worker" },
  { value: "professional", ko: "전문직 (의사/변호사/회계사 등)", en: "Professional" },
  { value: "creator", ko: "크리에이터/아티스트", en: "Creator / Artist" },
  { value: "student", ko: "학생", en: "Student" },
  { value: "self_employed", ko: "자영업/프리랜서", en: "Self-employed / Freelance" },
  { value: "other", ko: "기타", en: "Other" },
  { value: "unknown", ko: "선택하세요 (필수)", en: "Select one (required)" },
] as const;

const WORK_MODE_OPTIONS = [
  { value: "fixed", ko: "고정근무", en: "Fixed schedule" },
  { value: "flex", ko: "유연근무", en: "Flexible schedule" },
  { value: "shift", ko: "교대근무", en: "Shift work" },
  { value: "freelance", ko: "프리랜서", en: "Freelance" },
  { value: "other", ko: "기타", en: "Other" },
  { value: "unknown", ko: "선택하세요 (필수)", en: "Select one (required)" },
] as const;

export default function PreferencesPage() {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [locale, setLocale] = React.useState<Locale>("ko");
  const t = MESSAGES[locale];
  const isKo = locale === "ko";

  const [remindersEnabled, setRemindersEnabled] = React.useState(false);
  const [reminderLogTime, setReminderLogTime] = React.useState("21:30");
  const [reminderPlanTime, setReminderPlanTime] = React.useState("08:30");
  const [profile, setProfile] = React.useState<ProfilePreferences>(DEFAULT_PROFILE);
  const [notificationPermission, setNotificationPermission] = React.useState<NotificationPermission | "unsupported">(
    "unsupported"
  );
  const profileHelp = React.useMemo(
    () =>
      isKo
        ? {
            age: "이 정보로 연령대별 집중 시간대를 참고해 루틴 강도를 조절합니다.",
            gender: "이 정보로 유사 사용자 패턴 비교 정확도를 높입니다. 원치 않으면 '응답 안함'을 선택하세요.",
            job: "이 정보로 업무 맥락(깊은 집중/협업 비중)을 맞춘 루틴을 제안합니다.",
            mode: "이 정보로 근무 제약(고정/교대/유연)에 맞는 실행 가능한 시간표를 생성합니다.",
          }
        : {
            age: "Improves age-cohort calibration for realistic focus intensity.",
            gender: "Improves similar-user trend quality. You can choose 'Prefer not to say'.",
            job: "Adapts deep-work vs coordination balance to your work context.",
            mode: "Builds feasible time blocks around schedule constraints.",
          },
    [isKo]
  );

  React.useEffect(() => {
    setNotificationPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  const permissionBadge = React.useMemo(() => {
    if (notificationPermission === "unsupported") return { label: t.perm_unsupported, variant: "secondary" as const };
    if (notificationPermission === "granted") return { label: t.perm_on, variant: "default" as const };
    if (notificationPermission === "denied") return { label: t.perm_off, variant: "destructive" as const };
    return { label: t.perm_needed, variant: "secondary" as const };
  }, [notificationPermission, t]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user) return;

        const meta = (user.user_metadata as any) || {};

        const loc = meta["routineiq_locale"];
        if (
          !cancelled &&
          (loc === "en" || loc === "ko" || loc === "ja" || loc === "zh" || loc === "es")
        ) {
          setLocale(loc as Locale);
        }

        const r = meta["routineiq_reminders_v1"];
        if (r && typeof r === "object" && !cancelled) {
          setRemindersEnabled(Boolean((r as any).enabled));
          if (typeof (r as any).logTime === "string") setReminderLogTime(String((r as any).logTime));
          if (typeof (r as any).planTime === "string") setReminderPlanTime(String((r as any).planTime));
        }

        try {
          const prefs = await apiFetch<ProfilePreferences>("/preferences/profile");
          if (!cancelled) {
            setProfile({
              ...DEFAULT_PROFILE,
              ...prefs,
              trend_compare_by:
                Array.isArray(prefs.trend_compare_by) && prefs.trend_compare_by.length
                  ? prefs.trend_compare_by
                  : DEFAULT_PROFILE.trend_compare_by,
            });
          }
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveLocale() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ data: { routineiq_locale: locale } });
      if (error) throw error;
      setMessage(t.saved_lang);
      // Force reload to apply locale change immediately across the app
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.save_failed);
    } finally {
      setBusy(false);
    }
  }

  async function requestNotifications() {
    setError(null);
    setMessage(null);
    try {
      if (typeof Notification === "undefined")
        throw new Error(t.notif_unsupported);
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === "granted") setMessage(t.notif_enabled);
      else setMessage(t.notif_denied);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.req_failed);
    }
  }

  async function saveReminders() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        data: {
          routineiq_reminders_v1: {
            enabled: remindersEnabled,
            logTime: reminderLogTime,
            planTime: reminderPlanTime
          }
        }
      });
      if (error) throw error;
      setMessage(t.saved_reminders);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.save_failed);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfileSettings() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (
        profile.age_group === "unknown" ||
        profile.gender === "unknown" ||
        profile.job_family === "unknown" ||
        profile.work_mode === "unknown"
      ) {
        throw new Error(
          isKo
            ? "개인 설정 항목은 모두 필수입니다. 성별은 '응답 안함'을 선택할 수 있습니다."
            : "All profile fields are required. You can choose 'Prefer not to say' for gender."
        );
      }

      const payload: ProfilePreferences = {
        ...profile,
        trend_opt_in: true,
        trend_compare_by: ["age_group", "job_family", "work_mode"],
      };

      const saved = await apiFetch<ProfilePreferences>("/preferences/profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setProfile({
        ...DEFAULT_PROFILE,
        ...saved,
        trend_compare_by:
          Array.isArray(saved.trend_compare_by) && saved.trend_compare_by.length
            ? saved.trend_compare_by
            : DEFAULT_PROFILE.trend_compare_by,
      });

      setMessage(isKo ? "개인 설정을 저장했습니다." : "Profile settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.save_failed);
    } finally {
      setBusy(false);
    }
  }

  async function deleteData() {
    if (!confirm(t.reset_confirm)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch<{ ok: boolean }>("/preferences/data", { method: "DELETE" });
      setMessage(t.reset_complete);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.delete_failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="title-serif text-3xl">{t.title}</h1>
        <p className="mt-1 text-sm text-mutedFg">
          {t.subtitle}
        </p>
      </div>

      {message ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 transition-all">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      ) : null}

      <div className="grid gap-6">
        {/* Language */}
        <Card>
          <CardHeader>
            <CardTitle>{t.lang_title}</CardTitle>
            <CardDescription>{t.lang_desc}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as Locale)}
                className="h-10 w-full max-w-[200px] rounded-xl border bg-white/60 px-3 text-sm transition-colors focus:border-brand focus:outline-none"
              >
                <option value="ko">한국어</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
                <option value="zh">中文</option>
                <option value="es">Español</option>
              </select>
              <Button variant="secondary" onClick={saveLocale} disabled={busy}>
                {t.save}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Reminders */}
        <Card className="order-2">
          <CardHeader>
            <CardTitle>{t.notif_title}</CardTitle>
            <CardDescription>{t.notif_desc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-xl border bg-white/50 p-4">
              <div>
                <p className="text-sm font-semibold">{t.enable_reminders}</p>
                <p className="mt-1 text-xs text-mutedFg">
                  {t.enable_desc}
                </p>
              </div>
              <input
                type="checkbox"
                checked={remindersEnabled}
                onChange={(e) => setRemindersEnabled(e.target.checked)}
                className="h-5 w-5 accent-brand rounded border-gray-300"
              />
            </div>

            {remindersEnabled ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-mutedFg">{t.evening_check}</label>
                  <Input type="time" value={reminderLogTime} onChange={(e) => setReminderLogTime(e.target.value)} className="bg-white/60" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-mutedFg">{t.morning_check}</label>
                  <Input type="time" value={reminderPlanTime} onChange={(e) => setReminderPlanTime(e.target.value)} className="bg-white/60" />
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button onClick={saveReminders} disabled={busy} className="min-w-[80px]">
                {t.save}
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={requestNotifications}
                  disabled={busy || notificationPermission === "unsupported" || notificationPermission === "granted"}
                  className="text-xs text-mutedFg hover:bg-black/5"
                >
                  {t.check_perm}
                </Button>
                <Badge variant={permissionBadge.variant} className="text-[10px] px-2 h-5">
                  {permissionBadge.label}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Personal profile + goals */}
        <Card className="order-1">
          <CardHeader>
            <CardTitle>{isKo ? "개인 설정" : "Personal Profile"}</CardTitle>
            <CardDescription>
              {isKo
                ? "첫 AI 분석 전에 필요한 기본 정보입니다. 개인화 리포트와 유사 사용자 트렌드 정확도 향상에만 사용되며 성별은 '응답 안함' 선택이 가능합니다."
                : "Required before your first AI analysis. Used only for personalized reports and similar-user trend quality. Gender supports 'Prefer not to say'."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-mutedFg">{isKo ? "연령대" : "Age group"}</label>
                <p className="text-[11px] text-mutedFg">{profileHelp.age}</p>
                <select
                  value={profile.age_group}
                  onChange={(e) => setProfile((prev) => ({ ...prev, age_group: e.target.value as ProfilePreferences["age_group"] }))}
                  className="h-10 w-full rounded-xl border bg-white/60 px-3 text-sm transition-colors focus:border-brand focus:outline-none"
                >
                  {AGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {isKo ? opt.ko : opt.en}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-mutedFg">{isKo ? "성별" : "Gender"}</label>
                <p className="text-[11px] text-mutedFg">{profileHelp.gender}</p>
                <select
                  value={profile.gender}
                  onChange={(e) => setProfile((prev) => ({ ...prev, gender: e.target.value as ProfilePreferences["gender"] }))}
                  className="h-10 w-full rounded-xl border bg-white/60 px-3 text-sm transition-colors focus:border-brand focus:outline-none"
                >
                  {GENDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {isKo ? opt.ko : opt.en}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-mutedFg">{isKo ? "직군" : "Job family"}</label>
                <p className="text-[11px] text-mutedFg">{profileHelp.job}</p>
                <select
                  value={profile.job_family}
                  onChange={(e) => setProfile((prev) => ({ ...prev, job_family: e.target.value as ProfilePreferences["job_family"] }))}
                  className="h-10 w-full rounded-xl border bg-white/60 px-3 text-sm transition-colors focus:border-brand focus:outline-none"
                >
                  {JOB_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {isKo ? opt.ko : opt.en}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-mutedFg">{isKo ? "근무 형태" : "Work mode"}</label>
                <p className="text-[11px] text-mutedFg">{profileHelp.mode}</p>
                <select
                  value={profile.work_mode}
                  onChange={(e) => setProfile((prev) => ({ ...prev, work_mode: e.target.value as ProfilePreferences["work_mode"] }))}
                  className="h-10 w-full rounded-xl border bg-white/60 px-3 text-sm transition-colors focus:border-brand focus:outline-none"
                >
                  {WORK_MODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {isKo ? opt.ko : opt.en}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveProfileSettings} disabled={busy}>
                {t.save}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Privacy & Data */}
        <Card className="order-3">
          <CardHeader>
            <CardTitle>{t.privacy_title}</CardTitle>
            <CardDescription>{t.privacy_desc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-[#faf5ee] p-4 text-sm text-[#5c554e]">
              <ul className="list-disc space-y-1 pl-4">
                <li>{t.privacy_p1}</li>
                <li>{t.privacy_p2}</li>
                <li>{t.privacy_p3}</li>
              </ul>
            </div>

            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={deleteData} disabled={busy} className="text-red-700 hover:text-red-800 hover:bg-red-50 border-red-200">
                <Trash2 className="mr-2 h-4 w-4" />
                {t.reset_data}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
