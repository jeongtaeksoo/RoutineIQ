import { z } from "zod";

const NullableNumberSchema = z.union([z.number(), z.null()]).catch(null);

const BurnoutRiskSchema = z.enum(["low", "medium", "high"]).catch("medium");

const ProductivityPeakSchema = z
  .object({
    start: z.string().catch(""),
    end: z.string().catch(""),
    reason: z.string().catch(""),
  })
  .passthrough();

const FailurePatternSchema = z
  .object({
    pattern: z.string().catch(""),
    trigger: z.string().catch(""),
    fix: z.string().catch(""),
  })
  .passthrough();

const TomorrowRoutineSchema = z
  .object({
    start: z.string().catch(""),
    end: z.string().catch(""),
    activity: z.string().catch(""),
    goal: z.string().catch(""),
  })
  .passthrough();

const IfThenRuleSchema = z
  .object({
    if: z.string().catch(""),
    then: z.string().catch(""),
  })
  .passthrough();

const MicroAdviceSchema = z
  .object({
    action: z.string().catch(""),
    when: z.string().catch(""),
    reason: z.string().catch(""),
    duration_min: z.number().int().nonnegative().catch(5),
  })
  .passthrough();

const AnalysisMetaSchema = z
  .object({
    input_quality_score: z.number().optional(),
    profile_coverage_pct: z.number().optional(),
    wellbeing_signals_count: z.number().optional(),
    logged_entry_count: z.number().optional(),
    schema_retry_count: z.number().optional(),
    personalization_tier: z.string().optional(),
  })
  .partial()
  .passthrough();

export const AIReportSchema = z
  .object({
    schema_version: z.number().optional(),
    summary: z.string().catch(""),
    productivity_peaks: z.array(ProductivityPeakSchema).catch([]),
    failure_patterns: z.array(FailurePatternSchema).catch([]),
    tomorrow_routine: z.array(TomorrowRoutineSchema).catch([]),
    if_then_rules: z.array(IfThenRuleSchema).catch([]),
    coach_one_liner: z.string().catch(""),
    yesterday_plan_vs_actual: z
      .object({
        comparison_note: z.string().catch(""),
        top_deviation: z.string().catch(""),
      })
      .passthrough()
      .catch({ comparison_note: "", top_deviation: "" }),
    wellbeing_insight: z
      .object({
        burnout_risk: BurnoutRiskSchema.optional(),
        energy_curve_forecast: z.string().optional(),
        note: z.string().optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    micro_advice: z.array(MicroAdviceSchema).optional(),
    weekly_pattern_insight: z.string().optional(),
    analysis_meta: AnalysisMetaSchema.optional(),
  })
  .passthrough();

export const ReportEnvelopeSchema = z.object({
  date: z.string().min(1),
  report: AIReportSchema,
});

export const LogsEnvelopeSchema = z.object({
  date: z.string().min(1).catch(""),
  entries: z.array(z.unknown()).catch([]),
  note: z.union([z.string(), z.null()]).catch(null),
});

export const WeeklyInsightsSchema = z
  .object({
    from_date: z.string().catch(""),
    to_date: z.string().catch(""),
    weekly: z
      .object({
        days_logged: z.number().catch(0),
        days_total: z.number().catch(7),
        total_blocks: z.number().catch(0),
        deep_minutes: z.number().catch(0),
      })
      .passthrough(),
    streak: z
      .object({
        current: z.number().catch(0),
        longest: z.number().catch(0),
      })
      .partial()
      .optional(),
    trend: z.record(z.unknown()).optional(),
  })
  .passthrough();

const CohortMetricsSchema = z
  .object({
    focus_window_rate: NullableNumberSchema,
    rebound_rate: NullableNumberSchema,
    recovery_buffer_day_rate: NullableNumberSchema,
    focus_window_numerator: z.number().catch(0),
    focus_window_denominator: z.number().catch(0),
    rebound_numerator: z.number().catch(0),
    rebound_denominator: z.number().catch(0),
    recovery_day_numerator: z.number().catch(0),
    recovery_day_denominator: z.number().catch(0),
  })
  .passthrough();

export const CohortTrendSchema = z
  .object({
    enabled: z.boolean().catch(false),
    insufficient_sample: z.boolean().catch(false),
    min_sample_size: z.number().catch(50),
    preview_sample_size: z.number().catch(20),
    high_confidence_sample_size: z.number().catch(100),
    threshold_variant: z.string().catch("control"),
    preview_mode: z.boolean().catch(false),
    confidence_level: z.string().catch("low"),
    cohort_size: z.number().catch(0),
    active_users: z.number().catch(0),
    window_days: z.number().catch(14),
    compare_by: z.array(z.string()).catch([]),
    filters: z.record(z.string()).catch({}),
    metrics: CohortMetricsSchema,
    message: z.string().catch(""),
    my_focus_rate: NullableNumberSchema,
    my_rebound_rate: NullableNumberSchema,
    my_recovery_rate: NullableNumberSchema,
    my_focus_delta_7d: NullableNumberSchema,
    my_rebound_delta_7d: NullableNumberSchema,
    my_recovery_delta_7d: NullableNumberSchema,
    rank_label: z.string().catch(""),
    actionable_tip: z.string().catch(""),
  })
  .passthrough();

export const ProfileHealthSchema = z
  .object({
    age_group: z.string().optional(),
    gender: z.string().optional(),
    job_family: z.string().optional(),
    work_mode: z.string().optional(),
  })
  .passthrough();

export const RecoveryActiveSchema = z
  .object({
    has_open_session: z.boolean().catch(false),
    session_id: z.string().optional(),
    lapse_start_ts: z.string().optional(),
    elapsed_min: NullableNumberSchema.optional(),
    correlation_id: z.string().optional(),
  })
  .passthrough();

export const RecoveryNudgePayloadSchema = z
  .object({
    nudge_id: z.string().catch(""),
    session_id: z.string().catch(""),
    message: z.string().catch(""),
    lapse_start_ts: z.string().catch(""),
    created_at: z.string().catch(""),
    correlation_id: z.string().catch(""),
  })
  .passthrough();

export const RecoveryNudgeEnvelopeSchema = z
  .object({
    has_nudge: z.boolean().catch(false),
    nudge: RecoveryNudgePayloadSchema.nullish(),
    correlation_id: z.string().optional(),
  })
  .passthrough();

export const ProfilePreferencesSchema = z
  .object({
    age_group: z.enum(["0_17", "18_24", "25_34", "35_44", "45_plus", "unknown"]),
    gender: z.enum(["female", "male", "nonbinary", "prefer_not_to_say", "unknown"]),
    job_family: z.enum([
      "office_worker",
      "professional",
      "creator",
      "student",
      "self_employed",
      "other",
      "unknown",
    ]),
    work_mode: z.enum(["fixed", "flex", "shift", "freelance", "other", "unknown"]),
    trend_opt_in: z.boolean(),
    trend_compare_by: z
      .array(z.enum(["age_group", "gender", "job_family", "work_mode"]))
      .min(1)
      .catch(["age_group", "job_family", "work_mode"]),
    goal_keyword: z.string().nullable(),
    goal_minutes_per_day: z.number().int().nullable(),
  })
  .passthrough();

export const EntitlementsSchema = z
  .object({
    plan: z.enum(["free", "pro"]).catch("free"),
    is_pro: z.boolean().catch(false),
    status: z.string().nullable().optional(),
    current_period_end: z.string().nullable().optional(),
    cancel_at_period_end: z.boolean().nullable().optional(),
    needs_email_setup: z.boolean().catch(false),
    can_use_checkout: z.boolean().catch(true),
    analyze_used_today: z.number().int().nonnegative().catch(0),
    analyze_remaining_today: z.number().int().nonnegative().catch(0),
    limits: z
      .object({
        daily_analyze_limit: z.number().int().positive().catch(1),
        report_retention_days: z.number().int().positive().catch(3),
      })
      .passthrough(),
  })
  .passthrough();

export const ActivationSchema = z
  .object({
    profile_complete: z.boolean().catch(false),
    has_any_log: z.boolean().catch(false),
    has_any_report: z.boolean().catch(false),
    activation_complete: z.boolean().catch(false),
    next_step: z.enum(["profile", "log", "analyze", "complete"]).catch("profile"),
  })
  .passthrough();

export type AIReportShape = z.infer<typeof AIReportSchema>;
export type ReportEnvelopeShape = z.infer<typeof ReportEnvelopeSchema>;
export type LogsEnvelopeShape = z.infer<typeof LogsEnvelopeSchema>;
export type WeeklyInsightsShape = z.infer<typeof WeeklyInsightsSchema>;
export type CohortTrendShape = z.infer<typeof CohortTrendSchema>;
export type ProfilePreferencesShape = z.infer<typeof ProfilePreferencesSchema>;
export type ProfileHealthShape = z.infer<typeof ProfileHealthSchema>;
export type RecoveryActiveShape = z.infer<typeof RecoveryActiveSchema>;
export type RecoveryNudgePayloadShape = z.infer<typeof RecoveryNudgePayloadSchema>;
export type RecoveryNudgeEnvelopeShape = z.infer<typeof RecoveryNudgeEnvelopeSchema>;
export type EntitlementsShape = z.infer<typeof EntitlementsSchema>;
export type ActivationShape = z.infer<typeof ActivationSchema>;
