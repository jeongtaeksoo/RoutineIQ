export type Locale = "en" | "ko" | "ja" | "zh" | "es";

export function normalizeLocale(value: unknown): Locale {
  if (value === "ko" || value === "ja" || value === "zh" || value === "es") return value;
  return "en";
}

export type Strings = {
  nav_insights: string;
  nav_daily_flow: string;
  nav_reports: string;
  nav_plan: string;
  nav_billing: string;
  nav_admin: string;

  nav_short_insights: string;
  nav_short_daily_flow: string;
  nav_short_reports: string;
  nav_short_plan: string;
  nav_short_billing: string;

  sign_out: string;

  reminder_log_title: string;
  reminder_log_body: string;
  reminder_plan_title: string;
  reminder_plan_body: string;

};

const EN: Strings = {
  nav_insights: "My Insights",
  nav_daily_flow: "Daily Flow",
  nav_reports: "AI Coach Report",
  nav_plan: "Tomorrow Plan",
  nav_billing: "Plans & Billing",
  nav_admin: "Admin",

  nav_short_insights: "Insights",
  nav_short_daily_flow: "Flow",
  nav_short_reports: "Report",
  nav_short_plan: "Plan",
  nav_short_billing: "Billing",
  sign_out: "Sign out",

  reminder_log_title: "Log your day",
  reminder_log_body: "Open Daily Flow and capture the key blocks.",
  reminder_plan_title: "Review your plan",
  reminder_plan_body: "Check your insights and protect your power hours.",

};

const KO: Strings = {
  nav_insights: "나의 하루",
  nav_daily_flow: "기록하기",
  nav_reports: "AI 리포트",
  nav_plan: "내일 계획",
  nav_billing: "요금제/결제",
  nav_admin: "관리자",

  nav_short_insights: "하루",
  nav_short_daily_flow: "기록",
  nav_short_reports: "리포트",
  nav_short_plan: "계획",
  nav_short_billing: "결제",
  sign_out: "로그아웃",

  reminder_log_title: "오늘 기록하기",
  reminder_log_body: "오늘 기록을 열고 활동을 기록하세요.",
  reminder_plan_title: "오늘 계획 확인",
  reminder_plan_body: "인사이트를 확인하고 집중 시간을 챙기세요.",

};

const JA: Strings = {
  nav_insights: "マイ・インサイト",
  nav_daily_flow: "デイリーフロー",
  nav_reports: "AIコーチレポート",
  nav_plan: "明日の計画",
  nav_billing: "料金プラン/決済",
  nav_admin: "管理者",
  nav_short_insights: "インサイト",
  nav_short_daily_flow: "フロー",
  nav_short_reports: "レポート",
  nav_short_plan: "計画",
  nav_short_billing: "料金",
  sign_out: "ログアウト",
  reminder_log_title: "今日の記録",
  reminder_log_body: "デイリーフローを開いて、主要な活動を記録しましょう。",
  reminder_plan_title: "今日の計画を確認",
  reminder_plan_body: "インサイトを確認して、集中時間を確保しましょう。",

};

const ZH: Strings = {
  nav_insights: "我的洞察",
  nav_daily_flow: "每日流程",
  nav_reports: "AI教练报告",
  nav_plan: "明日计划",
  nav_billing: "方案与账单",
  nav_admin: "管理员",
  nav_short_insights: "洞察",
  nav_short_daily_flow: "流程",
  nav_short_reports: "报告",
  nav_short_plan: "计划",
  nav_short_billing: "账单",
  sign_out: "登出",
  reminder_log_title: "记录今天",
  reminder_log_body: "打开每日流程并记录关键事项。",
  reminder_plan_title: "查看计划",
  reminder_plan_body: "查看洞察并保护你的高效时间。",

};

const ES: Strings = {
  nav_insights: "Mis Insights",
  nav_daily_flow: "Flujo Diario",
  nav_reports: "Informe Coach AI",
  nav_plan: "Plan de manana",
  nav_billing: "Planes y Facturación",
  nav_admin: "Admin",
  nav_short_insights: "Insights",
  nav_short_daily_flow: "Flujo",
  nav_short_reports: "Informe",
  nav_short_plan: "Plan",
  nav_short_billing: "Planes",
  sign_out: "Cerrar sesión",
  reminder_log_title: "Registra tu día",
  reminder_log_body: "Abre el Flujo Diario y registra bloque clave.",
  reminder_plan_title: "Revisa tu plan",
  reminder_plan_body: "Revisa tus insights y protege tus horas de poder.",

};

export function getStrings(locale: Locale): Strings {
  switch (locale) {
    case "ko":
      return KO;
    case "ja":
      return JA;
    case "zh":
      return ZH;
    case "es":
      return ES;
    default:
      return EN;
  }
}
