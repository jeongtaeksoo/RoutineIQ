"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, Database, Mail, Settings, ShieldCheck, User, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BillingActions } from "@/components/billing-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, isApiFetchError } from "@/lib/api-client";
import type { Locale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";

type ReminderMeta = {
  enabled?: boolean;
  logTime?: string;
  planTime?: string;
};

type PlanTier = "free" | "pro";
type SettingsTab = "notifications" | "profile" | "data" | "account";
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

type Copy = {
  open: string;
  title: string;
  subtitle: string;
  tab_notifications: string;
  tab_profile: string;
  tab_data: string;
  tab_account: string;
  profile_title: string;
  profile_desc: string;
  profile_age: string;
  profile_gender: string;
  profile_job: string;
  profile_mode: string;
  profile_save_done: string;
  profile_required_error: string;
  notif_title: string;
  notif_desc: string;
  notif_toggle: string;
  notif_toggle_desc: string;
  evening: string;
  morning: string;
  save: string;
  check_perm: string;
  perm_on: string;
  perm_off: string;
  perm_needed: string;
  perm_unsupported: string;
  data_title: string;
  data_desc: string;
  data_p1: string;
  data_p2: string;
  data_p3: string;
  reset: string;
  reset_confirm: string;
  reset_done: string;
  account_title: string;
  account_desc: string;
  account_name: string;
  account_email: string;
  account_plan: string;
  account_delete: string;
  account_delete_confirm: string;
  free: string;
  pro: string;
  upgrade: string;
  billing_inline: string;
  close: string;
  saved: string;
  save_failed: string;
  delete_failed: string;
  notif_enabled: string;
  notif_denied: string;
  notif_unsupported: string;
  loading: string;
};

const EN_COPY: Copy = {
  open: "Settings",
  title: "Quick Settings",
  subtitle: "Manage notifications, data controls, and account in one place.",
  tab_notifications: "Notifications",
  tab_profile: "Profile",
  tab_data: "Data control",
  tab_account: "Account",
  profile_title: "Personal Profile",
  profile_desc: "Set required profile fields used for personalization and similar-user trends.",
  profile_age: "Age group",
  profile_gender: "Gender",
  profile_job: "Job family",
  profile_mode: "Work mode",
  profile_save_done: "Profile settings saved.",
  profile_required_error: "All profile fields are required. You can choose 'Prefer not to say' for gender.",
  notif_title: "Notifications",
  notif_desc: "Manage the current reminder settings here.",
  notif_toggle: "Enable reminders",
  notif_toggle_desc: "Browser must stay open to receive reminders.",
  evening: "Evening: log your day",
  morning: "Morning: review your plan",
  save: "Save",
  check_perm: "Check browser permission",
  perm_on: "On",
  perm_off: "Off",
  perm_needed: "Setup needed",
  perm_unsupported: "Unsupported",
  data_title: "Data control",
  data_desc: "Same data/privacy policy as existing preferences.",
  data_p1: "Your logs are used only for routine analysis.",
  data_p2: "No ads, no data selling.",
  data_p3: "You can delete all data at any time.",
  reset: "Reset all data",
  reset_confirm: "Delete all logs and reports? This cannot be undone.",
  reset_done: "All data has been reset.",
  account_title: "Account",
  account_desc: "Check your name, email, and current version.",
  account_name: "Name",
  account_email: "Email",
  account_plan: "Current version",
  account_delete: "Delete account",
  account_delete_confirm: "Delete your account permanently? All logs, reports, profile, and subscription data will be removed.",
  free: "Free",
  pro: "Pro",
  upgrade: "Upgrade to Pro",
  billing_inline: "You can upgrade directly in this panel.",
  close: "Close",
  saved: "Settings saved.",
  save_failed: "Failed to save.",
  delete_failed: "Failed to delete data.",
  notif_enabled: "Notifications enabled.",
  notif_denied: "Notifications denied.",
  notif_unsupported: "Notifications are not supported in this browser.",
  loading: "Loading...",
};

const KO_COPY: Copy = {
  open: "설정",
  title: "빠른 설정",
  subtitle: "알림, 데이터 제어, 계정을 한 곳에서 관리하세요.",
  tab_notifications: "알림",
  tab_profile: "개인설정",
  tab_data: "데이터 제어",
  tab_account: "계정",
  profile_title: "개인 설정",
  profile_desc: "맞춤 리포트와 유사 사용자 비교에 필요한 항목이에요.",
  profile_age: "연령대",
  profile_gender: "성별",
  profile_job: "직군",
  profile_mode: "근무 형태",
  profile_save_done: "개인 설정을 저장했습니다.",
  profile_required_error: "개인 설정 항목은 모두 필수입니다. 성별은 '응답 안함'을 선택할 수 있습니다.",
  notif_title: "알림",
  notif_desc: "기존 리마인더 설정을 여기서 바로 관리해요.",
  notif_toggle: "리마인더 켜기",
  notif_toggle_desc: "브라우저가 열려 있을 때 알림을 보냅니다.",
  evening: "저녁: 하루 기록하기",
  morning: "아침: 계획 확인하기",
  save: "저장",
  check_perm: "브라우저 권한 확인",
  perm_on: "알림 켜짐",
  perm_off: "알림 꺼짐",
  perm_needed: "설정 필요",
  perm_unsupported: "미지원",
  data_title: "데이터 제어",
  data_desc: "현재 데이터/개인정보 정책과 같은 기준이에요.",
  data_p1: "작성한 기록은 루틴 분석에만 사용됩니다.",
  data_p2: "광고/판매 목적으로 사용되지 않습니다.",
  data_p3: "원하면 언제든 모든 데이터를 삭제할 수 있습니다.",
  reset: "데이터 전체 초기화",
  reset_confirm: "모든 기록과 리포트를 삭제할까요? 복구할 수 없습니다.",
  reset_done: "데이터가 초기화되었습니다.",
  account_title: "계정",
  account_desc: "이름, 이메일, 현재 버전을 확인할 수 있습니다.",
  account_name: "이름",
  account_email: "이메일",
  account_plan: "현재 버전",
  account_delete: "회원탈퇴",
  account_delete_confirm: "정말 회원탈퇴할까요? 기록, 리포트, 개인설정, 구독 정보가 모두 삭제됩니다.",
  free: "일반(Free)",
  pro: "프로(Pro)",
  upgrade: "Pro로 업그레이드",
  billing_inline: "이 창에서 바로 결제/업그레이드할 수 있습니다.",
  close: "닫기",
  saved: "설정이 저장되었습니다.",
  save_failed: "저장에 실패했습니다.",
  delete_failed: "삭제에 실패했습니다.",
  notif_enabled: "알림이 켜졌습니다.",
  notif_denied: "알림이 거부되었습니다.",
  notif_unsupported: "이 브라우저는 알림을 지원하지 않습니다.",
  loading: "불러오는 중...",
};

const JA_COPY: Copy = {
  ...EN_COPY,
  open: "設定",
  title: "クイック設定",
  subtitle: "通知、データ管理、アカウントを一か所で管理できます。",
  tab_notifications: "通知",
  tab_data: "データ管理",
  tab_account: "アカウント",
  notif_title: "通知",
  notif_desc: "現在のリマインダー設定をここで管理します。",
  notif_toggle: "リマインダーを有効化",
  notif_toggle_desc: "通知を受け取るにはブラウザを開いたままにしてください。",
  evening: "夜: 一日の記録",
  morning: "朝: 計画の確認",
  save: "保存",
  check_perm: "ブラウザ権限を確認",
  perm_on: "オン",
  perm_off: "オフ",
  perm_needed: "設定が必要",
  perm_unsupported: "未対応",
  data_title: "データ管理",
  data_desc: "既存のデータ/プライバシーポリシーと同じ基準です。",
  data_p1: "記録データはルーティン分析のみに使用されます。",
  data_p2: "広告利用やデータ販売は行いません。",
  data_p3: "必要であればいつでも全データを削除できます。",
  reset: "すべてのデータを初期化",
  reset_confirm: "すべての記録とレポートを削除しますか？元に戻せません。",
  reset_done: "データを初期化しました。",
  account_title: "アカウント",
  account_desc: "名前、メール、現在のプランを確認できます。",
  account_name: "名前",
  account_email: "メール",
  account_plan: "現在のプラン",
  free: "無料(Free)",
  pro: "プロ(Pro)",
  upgrade: "Proにアップグレード",
  billing_inline: "この画面でそのまま決済/アップグレードできます。",
  close: "閉じる",
  saved: "設定を保存しました。",
  save_failed: "保存に失敗しました。",
  delete_failed: "削除に失敗しました。",
  notif_enabled: "通知を有効にしました。",
  notif_denied: "通知が拒否されました。",
  notif_unsupported: "このブラウザは通知に対応していません。",
  loading: "読み込み中...",
};

const ZH_COPY: Copy = {
  ...EN_COPY,
  open: "设置",
  title: "快速设置",
  subtitle: "在一个面板中管理通知、数据控制和账号。",
  tab_notifications: "通知",
  tab_data: "数据控制",
  tab_account: "账号",
  notif_title: "通知",
  notif_desc: "在这里直接管理当前提醒设置。",
  notif_toggle: "开启提醒",
  notif_toggle_desc: "浏览器保持打开时才会收到提醒。",
  evening: "晚上：记录今天",
  morning: "早上：查看计划",
  save: "保存",
  check_perm: "检查浏览器权限",
  perm_on: "已开启",
  perm_off: "已关闭",
  perm_needed: "需要设置",
  perm_unsupported: "不支持",
  data_title: "数据控制",
  data_desc: "与现有数据/隐私政策保持一致。",
  data_p1: "你的日志仅用于日常分析。",
  data_p2: "不会用于广告或出售数据。",
  data_p3: "你可以随时删除全部数据。",
  reset: "重置全部数据",
  reset_confirm: "确定删除所有日志和报告吗？此操作不可恢复。",
  reset_done: "数据已重置。",
  account_title: "账号",
  account_desc: "可查看姓名、邮箱和当前版本。",
  account_name: "姓名",
  account_email: "邮箱",
  account_plan: "当前版本",
  free: "免费(Free)",
  pro: "专业版(Pro)",
  upgrade: "升级到 Pro",
  billing_inline: "可在此窗口直接完成支付/升级。",
  close: "关闭",
  saved: "设置已保存。",
  save_failed: "保存失败。",
  delete_failed: "删除失败。",
  notif_enabled: "通知已开启。",
  notif_denied: "通知被拒绝。",
  notif_unsupported: "此浏览器不支持通知。",
  loading: "加载中...",
};

const ES_COPY: Copy = {
  ...EN_COPY,
  open: "Configuración",
  title: "Configuración rápida",
  subtitle: "Gestiona notificaciones, control de datos y cuenta en un solo lugar.",
  tab_notifications: "Notificaciones",
  tab_data: "Control de datos",
  tab_account: "Cuenta",
  notif_title: "Notificaciones",
  notif_desc: "Gestiona aquí la configuración actual de recordatorios.",
  notif_toggle: "Activar recordatorios",
  notif_toggle_desc: "El navegador debe permanecer abierto para recibir notificaciones.",
  evening: "Noche: registrar tu día",
  morning: "Mañana: revisar tu plan",
  save: "Guardar",
  check_perm: "Revisar permisos del navegador",
  perm_on: "Activado",
  perm_off: "Desactivado",
  perm_needed: "Configuración necesaria",
  perm_unsupported: "No compatible",
  data_title: "Control de datos",
  data_desc: "Misma política de datos/privacidad que en preferencias.",
  data_p1: "Tus registros se usan solo para análisis de rutinas.",
  data_p2: "Sin anuncios, sin venta de datos.",
  data_p3: "Puedes borrar todos los datos en cualquier momento.",
  reset: "Restablecer todos los datos",
  reset_confirm: "¿Eliminar todos los registros e informes? No se puede deshacer.",
  reset_done: "Todos los datos se restablecieron.",
  account_title: "Cuenta",
  account_desc: "Consulta tu nombre, correo y versión actual.",
  account_name: "Nombre",
  account_email: "Correo",
  account_plan: "Versión actual",
  free: "Gratis(Free)",
  pro: "Pro",
  upgrade: "Actualizar a Pro",
  billing_inline: "Puedes pagar/actualizar directamente en este panel.",
  close: "Cerrar",
  saved: "Configuración guardada.",
  save_failed: "Error al guardar.",
  delete_failed: "Error al eliminar datos.",
  notif_enabled: "Notificaciones activadas.",
  notif_denied: "Notificaciones denegadas.",
  notif_unsupported: "Este navegador no admite notificaciones.",
  loading: "Cargando...",
};

function getCopy(locale: Locale): Copy {
  switch (locale) {
    case "ko":
      return KO_COPY;
    case "ja":
      return JA_COPY;
    case "zh":
      return ZH_COPY;
    case "es":
      return ES_COPY;
    default:
      return EN_COPY;
  }
}

function displayName(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null): string {
  if (!user) return "-";
  const meta = user.user_metadata || {};
  const fromMeta =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    (typeof meta.user_name === "string" && meta.user_name.trim()) ||
    "";
  if (fromMeta) return fromMeta;
  if (!user.email) return "-";
  return user.email.split("@")[0] || user.email;
}

export function AppSettingsPanel({ locale }: { locale: Locale }) {
  const t = React.useMemo(() => getCopy(locale), [locale]);
  const isKo = locale === "ko";
  const supabaseRef = React.useRef<ReturnType<typeof createClient>>(undefined!);
  if (!supabaseRef.current) {
    supabaseRef.current = createClient();
  }

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<SettingsTab>("notifications");
  const [busy, setBusy] = React.useState(false);
  const [loadingAccount, setLoadingAccount] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState("-");
  const [email, setEmail] = React.useState("-");
  const [plan, setPlan] = React.useState<PlanTier>("free");
  const [needsEmailSetup, setNeedsEmailSetup] = React.useState(false);
  const [profile, setProfile] = React.useState<ProfilePreferences>(DEFAULT_PROFILE);
  const [deletingAccount, setDeletingAccount] = React.useState(false);

  const [remindersEnabled, setRemindersEnabled] = React.useState(false);
  const [reminderLogTime, setReminderLogTime] = React.useState("21:30");
  const [reminderPlanTime, setReminderPlanTime] = React.useState("08:30");
  const [notificationPermission, setNotificationPermission] = React.useState<NotificationPermission | "unsupported">(
    "unsupported"
  );

  const permissionBadge = React.useMemo(() => {
    if (notificationPermission === "unsupported") return { label: t.perm_unsupported, variant: "secondary" as const };
    if (notificationPermission === "granted") return { label: t.perm_on, variant: "default" as const };
    if (notificationPermission === "denied") return { label: t.perm_off, variant: "destructive" as const };
    return { label: t.perm_needed, variant: "secondary" as const };
  }, [notificationPermission, t.perm_needed, t.perm_off, t.perm_on, t.perm_unsupported]);

  const loadCurrentSettings = React.useCallback(async () => {
    setLoadingAccount(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabaseRef.current.auth.getUser();
      setName(displayName(user));
      setEmail(user?.email || "-");
      setNeedsEmailSetup(!user?.email);

      const reminderMeta = (user?.user_metadata?.routineiq_reminders_v1 || {}) as ReminderMeta;
      setRemindersEnabled(Boolean(reminderMeta.enabled));
      if (typeof reminderMeta.logTime === "string") setReminderLogTime(reminderMeta.logTime);
      if (typeof reminderMeta.planTime === "string") setReminderPlanTime(reminderMeta.planTime);

      if (typeof Notification === "undefined") {
        setNotificationPermission("unsupported");
      } else {
        setNotificationPermission(Notification.permission);
      }

      const uid = user?.id || "";
      if (!uid) {
        setPlan("free");
      } else {
        const { data: sub } = await supabaseRef.current
          .from("subscriptions")
          .select("plan,status")
          .eq("user_id", uid)
          .maybeSingle();
        const isPro = sub?.plan === "pro" && (sub.status === "active" || sub.status === "trialing");
        setPlan(isPro ? "pro" : "free");
      }

      try {
        const prefs = await apiFetch<ProfilePreferences>("/preferences/profile");
        setProfile({
          ...DEFAULT_PROFILE,
          ...prefs,
          trend_compare_by:
            Array.isArray(prefs.trend_compare_by) && prefs.trend_compare_by.length
              ? prefs.trend_compare_by
              : DEFAULT_PROFILE.trend_compare_by,
        });
      } catch {
        // ignore preferences fetch failures in quick panel
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.save_failed);
    } finally {
      setLoadingAccount(false);
    }
  }, [t.save_failed]);

  React.useEffect(() => {
    if (!open) return;
    void loadCurrentSettings();
  }, [loadCurrentSettings, open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  React.useEffect(() => {
    if (searchParams.get("settings") !== "1") return;
    const tabParam = searchParams.get("settingsTab");
    const nextTab: SettingsTab =
      tabParam === "profile" || tabParam === "data" || tabParam === "account" || tabParam === "notifications"
        ? tabParam
        : "notifications";
    setActiveTab(nextTab);
    setOpen(true);

    const cleaned = new URLSearchParams(searchParams.toString());
    cleaned.delete("settings");
    cleaned.delete("settingsTab");
    const query = cleaned.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  async function requestNotifications() {
    setError(null);
    setMessage(null);
    try {
      if (typeof Notification === "undefined") throw new Error(t.notif_unsupported);
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      setMessage(permission === "granted" ? t.notif_enabled : t.notif_denied);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.save_failed);
    }
  }

  async function saveReminders() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { error: updateError } = await supabaseRef.current.auth.updateUser({
        data: {
          routineiq_reminders_v1: {
            enabled: remindersEnabled,
            logTime: reminderLogTime,
            planTime: reminderPlanTime,
          },
        },
      });
      if (updateError) throw updateError;
      setMessage(t.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.save_failed);
    } finally {
      setBusy(false);
    }
  }

  async function deleteData() {
    if (!window.confirm(t.reset_confirm)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch<{ ok: boolean }>("/preferences/data", { method: "DELETE" });
      setMessage(t.reset_done);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.delete_failed);
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
        throw new Error(t.profile_required_error);
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
      setMessage(t.profile_save_done);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.save_failed);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (!window.confirm(t.account_delete_confirm)) return;
    setDeletingAccount(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch<{ ok: boolean }>("/preferences/account", {
        method: "DELETE",
        timeoutMs: 120_000,
        retryOnTimeout: true,
      });
      // Never block redirect on signOut network latency; account deletion already succeeded.
      await Promise.race([
        supabaseRef.current.auth.signOut().catch(() => null),
        new Promise((resolve) => window.setTimeout(resolve, 1_500)),
      ]);
      window.location.assign("/login?deleted=1");
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setError(err instanceof Error ? `${err.message}${hint}` : t.delete_failed);
      setDeletingAccount(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={t.open}
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 rounded-full border bg-[hsl(var(--card)/0.95)] p-3 text-fg shadow-elevated transition hover:scale-[1.03] hover:bg-[hsl(var(--card))] md:bottom-5"
      >
        <Settings className="h-4 w-4" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4">
          <button type="button" aria-label={t.close} className="absolute inset-0 h-full w-full" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-[min(92vw,560px)] max-h-[84vh] aspect-square overflow-hidden rounded-2xl border bg-[hsl(var(--card))] shadow-elevated">
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between border-b px-5 py-4">
                <div>
                  <h2 className="title-serif text-2xl">{t.title}</h2>
                  <p className="mt-1 text-xs text-mutedFg">{t.subtitle}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t.close}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {message ? (
                  <div className="mb-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div>
                ) : null}
                {error ? (
                  <div className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div>
                ) : null}

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SettingsTab)} className="h-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="notifications">{t.tab_notifications}</TabsTrigger>
                    <TabsTrigger value="profile">{t.tab_profile}</TabsTrigger>
                    <TabsTrigger value="data">{t.tab_data}</TabsTrigger>
                    <TabsTrigger value="account">{t.tab_account}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="notifications" className="mt-4 space-y-4">
                    <div className="rounded-xl border bg-white/50 p-4">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-brand" />
                        <p className="text-sm font-semibold">{t.notif_title}</p>
                      </div>
                      <p className="mt-1 text-xs text-mutedFg">{t.notif_desc}</p>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border bg-white/50 p-4">
                      <div>
                        <p className="text-sm font-semibold">{t.notif_toggle}</p>
                        <p className="mt-1 text-xs text-mutedFg">{t.notif_toggle_desc}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={remindersEnabled}
                        onChange={(e) => setRemindersEnabled(e.target.checked)}
                        className="h-5 w-5 rounded border-gray-300 accent-brand"
                      />
                    </div>

                    {remindersEnabled ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-xs text-mutedFg">{t.evening}</label>
                          <Input type="time" value={reminderLogTime} onChange={(e) => setReminderLogTime(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs text-mutedFg">{t.morning}</label>
                          <Input type="time" value={reminderPlanTime} onChange={(e) => setReminderPlanTime(e.target.value)} />
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={saveReminders} disabled={busy}>
                        {busy ? t.loading : t.save}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={requestNotifications}
                        disabled={busy || notificationPermission === "unsupported" || notificationPermission === "granted"}
                      >
                        {t.check_perm}
                      </Button>
                      <Badge variant={permissionBadge.variant}>{permissionBadge.label}</Badge>
                    </div>
                  </TabsContent>

                  <TabsContent value="profile" className="mt-4 space-y-4">
                    <div className="rounded-xl border bg-white/50 p-4">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-brand" />
                        <p className="text-sm font-semibold">{t.profile_title}</p>
                      </div>
                      <p className="mt-1 text-xs text-mutedFg">{t.profile_desc}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs text-mutedFg">{t.profile_age}</label>
                        <select
                          value={profile.age_group}
                          onChange={(e) =>
                            setProfile((prev) => ({ ...prev, age_group: e.target.value as ProfilePreferences["age_group"] }))
                          }
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
                        <label className="text-xs text-mutedFg">{t.profile_gender}</label>
                        <select
                          value={profile.gender}
                          onChange={(e) =>
                            setProfile((prev) => ({ ...prev, gender: e.target.value as ProfilePreferences["gender"] }))
                          }
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
                        <label className="text-xs text-mutedFg">{t.profile_job}</label>
                        <select
                          value={profile.job_family}
                          onChange={(e) =>
                            setProfile((prev) => ({ ...prev, job_family: e.target.value as ProfilePreferences["job_family"] }))
                          }
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
                        <label className="text-xs text-mutedFg">{t.profile_mode}</label>
                        <select
                          value={profile.work_mode}
                          onChange={(e) =>
                            setProfile((prev) => ({ ...prev, work_mode: e.target.value as ProfilePreferences["work_mode"] }))
                          }
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
                        {busy ? t.loading : t.save}
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="data" className="mt-4 space-y-4">
                    <div className="rounded-xl border bg-white/50 p-4">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-brand" />
                        <p className="text-sm font-semibold">{t.data_title}</p>
                      </div>
                      <p className="mt-1 text-xs text-mutedFg">{t.data_desc}</p>
                    </div>

                    <div className="rounded-xl border bg-[#faf5ee] p-4 text-sm text-[#5c554e]">
                      <ul className="list-disc space-y-1 pl-4">
                        <li>{t.data_p1}</li>
                        <li>{t.data_p2}</li>
                        <li>{t.data_p3}</li>
                      </ul>
                    </div>

                    <Button variant="outline" onClick={deleteData} disabled={busy} className="border-red-200 text-red-700 hover:bg-red-50">
                      {t.reset}
                    </Button>
                  </TabsContent>

                  <TabsContent value="account" className="mt-4 space-y-4">
                    <div className="rounded-xl border bg-white/50 p-4">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-brand" />
                        <p className="text-sm font-semibold">{t.account_title}</p>
                      </div>
                      <p className="mt-1 text-xs text-mutedFg">{t.account_desc}</p>
                    </div>

                    <div className="space-y-2 rounded-xl border bg-white/50 p-4 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-mutedFg">{t.account_name}</span>
                        <span className="font-medium">{loadingAccount ? t.loading : name}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-mutedFg">{t.account_email}</span>
                        <span className="font-medium">{loadingAccount ? t.loading : email}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-mutedFg">{t.account_plan}</span>
                        <span className="font-semibold">{plan === "pro" ? t.pro : t.free}</span>
                      </div>
                    </div>

                    {plan === "free" ? (
                      <div className="space-y-2 rounded-xl border bg-white/55 p-3">
                        <div className="flex items-center gap-2 text-xs text-mutedFg">
                          <Mail className="h-3.5 w-3.5" />
                          {t.billing_inline}
                        </div>
                        <BillingActions plan="free" needsEmailSetup={needsEmailSetup} localeOverride={locale} />
                      </div>
                    ) : (
                      <div className="rounded-xl border bg-emerald-50 p-3 text-sm text-emerald-900">
                        {t.pro}
                      </div>
                    )}

                    <Button
                      variant="outline"
                      onClick={deleteAccount}
                      disabled={deletingAccount}
                      className="border-red-200 text-red-700 hover:bg-red-50"
                    >
                      {deletingAccount ? t.loading : t.account_delete}
                    </Button>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
