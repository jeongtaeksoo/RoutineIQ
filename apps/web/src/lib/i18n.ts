export type Locale = "en" | "ko" | "ja" | "zh" | "es";

export function normalizeLocale(value: unknown): Locale {
  if (value === "ko" || value === "ja" || value === "zh" || value === "es") return value;
  return "en";
}

export type Strings = {
  nav_insights: string;
  nav_daily_flow: string;
  nav_reports: string;
  nav_billing: string;
  nav_preferences: string;
  nav_admin: string;

  nav_short_insights: string;
  nav_short_daily_flow: string;
  nav_short_reports: string;
  nav_short_billing: string;
  nav_short_preferences: string;

  signed_in_as: string;
  visitor: string;
  sign_out: string;

  reminder_log_title: string;
  reminder_log_body: string;
  reminder_plan_title: string;
  reminder_plan_body: string;

  suggest_activity: string;
  reflect_on_day: string;
  generating: string;
  error_try_again: string;

};

const EN: Strings = {
  nav_insights: "My Insights",
  nav_daily_flow: "Daily Flow",
  nav_reports: "AI Coach Report",
  nav_billing: "Plans & Billing",
  nav_preferences: "Preferences",
  nav_admin: "Admin",

  nav_short_insights: "Insights",
  nav_short_daily_flow: "Flow",
  nav_short_reports: "Report",
  nav_short_billing: "Billing",
  nav_short_preferences: "Prefs",

  signed_in_as: "Signed in as",
  visitor: "Visitor",
  sign_out: "Sign out",

  reminder_log_title: "Log your day",
  reminder_log_body: "Open Daily Flow and capture the key blocks.",
  reminder_plan_title: "Review your plan",
  reminder_plan_body: "Check your insights and protect your power hours.",

  suggest_activity: "Suggest Activity",
  reflect_on_day: "Reflect on Day",
  generating: "Generating...",
  error_try_again: "Error, try again",
};

const KO: Strings = {
  nav_insights: "나의 하루",
  nav_daily_flow: "기록하기",
  nav_reports: "AI 리포트",
  nav_billing: "요금제/결제",
  nav_preferences: "설정",
  nav_admin: "관리자",

  nav_short_insights: "하루",
  nav_short_daily_flow: "기록",
  nav_short_reports: "리포트",
  nav_short_billing: "결제",
  nav_short_preferences: "설정",

  signed_in_as: "로그인",
  visitor: "방문자",
  sign_out: "로그아웃",

  reminder_log_title: "오늘 기록하기",
  reminder_log_body: "오늘 기록을 열고 활동을 기록하세요.",
  reminder_plan_title: "오늘 계획 확인",
  reminder_plan_body: "인사이트를 확인하고 집중 시간을 챙기세요.",

  suggest_activity: "활동 추천받기",
  reflect_on_day: "하루 회고하기",
  generating: "생성 중...",
  error_try_again: "오류가 발생했습니다",
};

const JA: Strings = {
  nav_insights: "マイ・インサイト",
  nav_daily_flow: "デイリーフロー",
  nav_reports: "AIコーチレポート",
  nav_billing: "料金プラン/決済",
  nav_preferences: "設定",
  nav_admin: "管理者",
  nav_short_insights: "インサイト",
  nav_short_daily_flow: "フロー",
  nav_short_reports: "レポート",
  nav_short_billing: "料金",
  nav_short_preferences: "設定",
  signed_in_as: "ログイン中",
  visitor: "訪問ユーザー",
  sign_out: "ログアウト",
  reminder_log_title: "今日の記録",
  reminder_log_body: "デイリーフローを開いて、主要な活動を記録しましょう。",
  reminder_plan_title: "今日の計画を確認",
  reminder_plan_body: "インサイトを確認して、集中時間を確保しましょう。",

  suggest_activity: "活動の提案",
  reflect_on_day: "一日を振り返る",
  generating: "生成中...",
  error_try_again: "エラー、再試行してください",
};

const ZH: Strings = {
  nav_insights: "我的洞察",
  nav_daily_flow: "每日流程",
  nav_reports: "AI教练报告",
  nav_billing: "方案与账单",
  nav_preferences: "设置",
  nav_admin: "管理员",
  nav_short_insights: "洞察",
  nav_short_daily_flow: "流程",
  nav_short_reports: "报告",
  nav_short_billing: "账单",
  nav_short_preferences: "设置",
  signed_in_as: "已登录",
  visitor: "访问用户",
  sign_out: "登出",
  reminder_log_title: "记录今天",
  reminder_log_body: "打开每日流程并记录关键事项。",
  reminder_plan_title: "查看计划",
  reminder_plan_body: "查看洞察并保护你的高效时间。",

  suggest_activity: "建议活动",
  reflect_on_day: "回顾这一天",
  generating: "生成中...",
  error_try_again: "错误，请重试",
};

const ES: Strings = {
  nav_insights: "Mis Insights",
  nav_daily_flow: "Flujo Diario",
  nav_reports: "Informe Coach AI",
  nav_billing: "Planes y Facturación",
  nav_preferences: "Preferencias",
  nav_admin: "Admin",
  nav_short_insights: "Insights",
  nav_short_daily_flow: "Flujo",
  nav_short_reports: "Informe",
  nav_short_billing: "Planes",
  nav_short_preferences: "Prefs",
  signed_in_as: "Sesión iniciada",
  visitor: "Visitante",
  sign_out: "Cerrar sesión",
  reminder_log_title: "Registra tu día",
  reminder_log_body: "Abre el Flujo Diario y registra bloque clave.",
  reminder_plan_title: "Revisa tu plan",
  reminder_plan_body: "Revisa tus insights y protege tus horas de poder.",

  suggest_activity: "Sugerir actividad",
  reflect_on_day: "Reflexionar sobre el día",
  generating: "Generando...",
  error_try_again: "Error, inténtalo de nuevo",
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
