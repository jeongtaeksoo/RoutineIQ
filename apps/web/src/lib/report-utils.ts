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

const KO_SOFTEN_RULES: Array<[RegExp, string]> = [
    [/가설 기반 제안입니다\.?/g, "초기 제안 단계예요."],
    [/더 많은 데이터가 필요합니다\.?/g, "패턴을 더 정확히 보려면 2~3일 정도 기록을 더 쌓아보세요."],
    [/어제의 추천 계획이 없었습니다\.?/g, "어제 추천 계획 데이터가 없어 직접 비교는 어려워요."],
    [/구체적인 계획이 필요합니다\.?/g, "오늘은 작게 시작할 수 있는 계획 하나만 정해보세요."],
    [/계획된 블록이 없음\.?/g, "아직 계획된 블록이 없어요."],
    [/데이터 신호가 제한적이어서 가설 기반 제안입니다\.?/g, "기록 신호가 아직 적어 이번 제안은 초안이에요."],
    [/내일은 집중과 실행을 중점적으로 계획하세요\.?/g, "내일은 집중 블록 1개와 실행 블록 1개부터 가볍게 시작해보세요."],
    [/최소\s*(\d+)\s*개 블록에 남겨주세요\.?/g, "가능하면 $1개 이상 블록에 남겨주시면 정확도가 더 좋아져요."],
];

const EN_SOFTEN_RULES: Array<[RegExp, string]> = [
    [/This is a hypothesis-based suggestion\.?/gi, "This is an early suggestion based on limited signals."],
    [/More data is needed\.?/gi, "Add a bit more data to sharpen this pattern."],
    [/No planned blocks\.?/gi, "No planned blocks yet."],
    [/A concrete plan is needed\.?/gi, "Try setting one small concrete plan first."],
];

function normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

function softenNarrative(text: string, isKo: boolean): string {
    let output = normalizeWhitespace(text);
    if (!output) return output;
    const rules = isKo ? KO_SOFTEN_RULES : EN_SOFTEN_RULES;
    rules.forEach(([pattern, replacement]) => {
        output = output.replace(pattern, replacement);
    });
    return output;
}

function normalizeNarrative(input: unknown, fallback: string, isKo: boolean): string {
    if (typeof input !== "string") return fallback;
    const normalized = softenNarrative(input, isKo);
    return normalized || fallback;
}

export function normalizeReport(raw: AIReport | null, isKo: boolean): AIReport | null {
    if (!raw) return null;
    const riskRaw = String(raw?.wellbeing_insight?.burnout_risk || "medium").toLowerCase();
    const burnout_risk = riskRaw === "low" || riskRaw === "high" ? riskRaw : "medium";
    const summaryFallback = isKo
        ? "오늘 기록을 바탕으로 내일 실행 흐름을 정리했어요."
        : "Based on your log, we drafted a practical flow for tomorrow.";
    const comparisonFallback = isKo
        ? "직전 계획과 비교할 데이터가 아직 충분하지 않아요."
        : "Not enough baseline data yet for a reliable plan comparison.";
    const deviationFallback = isKo
        ? "패턴을 확인할 데이터가 더 쌓이면 원인이 더 구체적으로 보입니다."
        : "As more data accumulates, the main deviation becomes clearer.";
    const microRaw = Array.isArray(raw?.micro_advice) ? raw.micro_advice : [];
    const peakRaw = Array.isArray(raw?.productivity_peaks) ? raw.productivity_peaks : [];
    const failureRaw = Array.isArray(raw?.failure_patterns) ? raw.failure_patterns : [];
    const routineRaw = Array.isArray(raw?.tomorrow_routine) ? raw.tomorrow_routine : [];
    const ifThenRaw = Array.isArray(raw?.if_then_rules) ? raw.if_then_rules : [];
    const metaRaw = raw?.analysis_meta && typeof raw.analysis_meta === "object" ? raw.analysis_meta : {};
    const tierRaw = String(metaRaw?.personalization_tier || "low").toLowerCase();
    const personalization_tier =
        tierRaw === "high" || tierRaw === "medium" || tierRaw === "low" ? tierRaw : "low";
    return {
        ...raw,
        schema_version: Number.isFinite(Number(raw?.schema_version)) ? Number(raw?.schema_version) : 1,
        summary: normalizeNarrative(raw.summary, summaryFallback, isKo),
        coach_one_liner: normalizeNarrative(
            raw.coach_one_liner,
            isKo ? "내일 가장 중요한 한 가지를 먼저 정해보세요." : "Pick one most important action for tomorrow first.",
            isKo
        ),
        productivity_peaks: peakRaw
            .filter((item) => item && typeof item.start === "string" && typeof item.end === "string")
            .map((item) => ({
                start: item.start,
                end: item.end,
                reason: normalizeNarrative(
                    item.reason,
                    isKo ? "기록이 쌓이면 집중 시간대 이유를 더 정확히 보여드릴게요." : "As logs grow, we can explain your focus window more precisely.",
                    isKo
                ),
            })),
        failure_patterns: failureRaw
            .filter((item) => item && typeof item.pattern === "string" && typeof item.trigger === "string" && typeof item.fix === "string")
            .map((item) => ({
                pattern: normalizeNarrative(item.pattern, isKo ? "흐름 저하 패턴" : "Flow-break pattern", isKo),
                trigger: normalizeNarrative(item.trigger, isKo ? "원인 데이터가 아직 제한적이에요." : "Trigger signal is still limited.", isKo),
                fix: normalizeNarrative(item.fix, isKo ? "다음 블록 전에 5분 리셋을 넣어보세요." : "Try a 5-minute reset before the next block.", isKo),
            })),
        tomorrow_routine: routineRaw
            .filter((item) => item && typeof item.start === "string" && typeof item.end === "string")
            .map((item) => ({
                start: item.start,
                end: item.end,
                activity: normalizeNarrative(item.activity, isKo ? "집중 블록" : "Focus block", isKo),
                goal: normalizeNarrative(
                    item.goal,
                    isKo ? "바로 시작할 수 있는 가장 작은 행동을 정해보세요." : "Set the smallest action you can start immediately.",
                    isKo
                ),
            })),
        if_then_rules: ifThenRaw
            .filter((item) => item && typeof item.if === "string" && typeof item.then === "string")
            .map((item) => ({
                if: normalizeNarrative(item.if, isKo ? "집중이 흐트러질 때" : "When focus drops", isKo),
                then: normalizeNarrative(item.then, isKo ? "3분만 리셋한 뒤 20분 집중을 다시 시작해보세요." : "Take a 3-minute reset, then restart with a 20-minute focus sprint.", isKo),
            })),
        yesterday_plan_vs_actual: {
            comparison_note: normalizeNarrative(raw?.yesterday_plan_vs_actual?.comparison_note, comparisonFallback, isKo),
            top_deviation: normalizeNarrative(raw?.yesterday_plan_vs_actual?.top_deviation, deviationFallback, isKo),
        },
        wellbeing_insight: {
            burnout_risk,
            energy_curve_forecast: normalizeNarrative(
                raw?.wellbeing_insight?.energy_curve_forecast,
                isKo ? "기록이 더 쌓이면 에너지 흐름 예측이 더 선명해져요." : "Energy forecast becomes clearer as more days are logged.",
                isKo
            ),
            note: normalizeNarrative(
                raw?.wellbeing_insight?.note,
                isKo ? "내일은 회복 시간을 1개만 먼저 고정해보세요." : "Lock one recovery buffer first tomorrow.",
                isKo
            ),
        },
        micro_advice: microRaw
            .filter((it) => it && typeof it.action === "string" && typeof it.when === "string" && typeof it.reason === "string")
            .map((it) => ({
                action: normalizeNarrative(it.action, isKo ? "가볍게 시작할 한 가지 행동" : "One easy action to start", isKo),
                when: normalizeNarrative(it.when, isKo ? "다음 블록 시작 직전" : "Right before your next block", isKo),
                reason: normalizeNarrative(it.reason, isKo ? "작은 시작이 실행 유지에 가장 효과적이에요." : "Small starts are most effective for consistency.", isKo),
                duration_min: Number.isFinite(Number(it.duration_min)) ? Math.min(20, Math.max(1, Number(it.duration_min))) : 5,
            })),
        weekly_pattern_insight: normalizeNarrative(
            raw?.weekly_pattern_insight,
            isKo ? "주간 패턴은 3일 이상 기록하면 더 선명해져요." : "Weekly pattern insight becomes clearer after at least 3 logged days.",
            isKo
        ),
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
