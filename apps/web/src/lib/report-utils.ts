/**
 * Shared report normalization utilities.
 * Extracted from insights/page.tsx and reports/[date]/page.tsx.
 */

export type AIReport = {
    schema_version?: number;
    summary: string;
    productivity_peaks: { start: string; end: string; reason: string }[];
    failure_patterns: { pattern: string; trigger: string; fix: string }[];
    tomorrow_routine: { start: string; end: string; activity: string; goal: string }[];
    if_then_rules: { if: string; then: string }[];
    coach_one_liner: string;
    yesterday_plan_vs_actual: { comparison_note: string; top_deviation: string };
    wellbeing_insight?: {
        burnout_risk?: "low" | "medium" | "high" | string;
        energy_curve_forecast?: string;
        note?: string;
    };
    micro_advice?: { action: string; when: string; reason: string; duration_min: number }[];
    weekly_pattern_insight?: string;
    analysis_meta?: {
        input_quality_score?: number;
        profile_coverage_pct?: number;
        wellbeing_signals_count?: number;
        logged_entry_count?: number;
        schema_retry_count?: number;
        personalization_tier?: "low" | "medium" | "high" | string;
    };
};

export function normalizeReport(raw: AIReport | null, isKo: boolean): AIReport | null {
    if (!raw) return null;
    const riskRaw = String(raw?.wellbeing_insight?.burnout_risk || "medium").toLowerCase();
    const burnout_risk = riskRaw === "low" || riskRaw === "high" ? riskRaw : "medium";
    const microRaw = Array.isArray(raw?.micro_advice) ? raw.micro_advice : [];
    const metaRaw = raw?.analysis_meta && typeof raw.analysis_meta === "object" ? raw.analysis_meta : {};
    const tierRaw = String(metaRaw?.personalization_tier || "low").toLowerCase();
    const personalization_tier =
        tierRaw === "high" || tierRaw === "medium" || tierRaw === "low" ? tierRaw : "low";
    return {
        ...raw,
        schema_version: Number.isFinite(Number(raw?.schema_version)) ? Number(raw?.schema_version) : 1,
        wellbeing_insight: {
            burnout_risk,
            energy_curve_forecast:
                typeof raw?.wellbeing_insight?.energy_curve_forecast === "string" && raw.wellbeing_insight.energy_curve_forecast.trim()
                    ? raw.wellbeing_insight.energy_curve_forecast
                    : (isKo ? "\uae30\ub85d\uc774 \ub354 \uc313\uc774\uba74 \uc5d0\ub108\uc9c0 \uc608\uce21\uc774 \uc815\ud655\ud574\uc838\uc694." : "Energy forecast improves as more days are logged."),
            note:
                typeof raw?.wellbeing_insight?.note === "string" && raw.wellbeing_insight.note.trim()
                    ? raw.wellbeing_insight.note
                    : (isKo ? "\ub0b4\uc77c \ud68c\ubcf5 \uc2dc\uac04 1\uac1c\ub97c \uba3c\uc800 \ucc59\uaca8\uc8fc\uc138\uc694." : "Lock one recovery buffer first tomorrow."),
        },
        micro_advice: microRaw
            .filter((it) => it && typeof it.action === "string" && typeof it.when === "string" && typeof it.reason === "string")
            .map((it) => ({
                action: it.action,
                when: it.when,
                reason: it.reason,
                duration_min: Number.isFinite(Number(it.duration_min)) ? Math.min(20, Math.max(1, Number(it.duration_min))) : 5,
            })),
        weekly_pattern_insight:
            typeof raw?.weekly_pattern_insight === "string" && raw.weekly_pattern_insight.trim()
                ? raw.weekly_pattern_insight
                : (isKo ? "\uc8fc\uac04 \ud328\ud134\uc740 3\uc77c \uae30\ub85d \ud6c4 \ub354 \uc120\uba85\ud574\uc838\uc694." : "Weekly pattern insight becomes clearer after at least 3 logged days."),
        analysis_meta: {
            input_quality_score: Number.isFinite(Number(metaRaw?.input_quality_score))
                ? Math.max(0, Math.min(100, Number(metaRaw.input_quality_score)))
                : 0,
            profile_coverage_pct: Number.isFinite(Number(metaRaw?.profile_coverage_pct))
                ? Math.max(0, Math.min(100, Number(metaRaw.profile_coverage_pct)))
                : 0,
            wellbeing_signals_count: Number.isFinite(Number(metaRaw?.wellbeing_signals_count))
                ? Math.max(0, Math.min(6, Math.round(Number(metaRaw.wellbeing_signals_count))))
                : 0,
            logged_entry_count: Number.isFinite(Number(metaRaw?.logged_entry_count))
                ? Math.max(0, Math.min(200, Math.round(Number(metaRaw.logged_entry_count))))
                : 0,
            schema_retry_count: Number.isFinite(Number(metaRaw?.schema_retry_count))
                ? Math.max(0, Math.min(3, Math.round(Number(metaRaw.schema_retry_count))))
                : 0,
            personalization_tier,
        },
    };
}
