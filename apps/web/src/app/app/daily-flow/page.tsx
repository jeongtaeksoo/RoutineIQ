"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Clock, Pencil, Sparkles, Target, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, isApiFetchError } from "@/lib/api-client";
import { localYYYYMMDD, addDays, toMinutes } from "@/lib/date-utils";

type FlowStep = "write" | "confirm" | "done";

type Mood = "very_low" | "low" | "neutral" | "good" | "great";
type Confidence = "high" | "medium" | "low";
type TimeSource = "explicit" | "relative" | "window" | "unknown" | "user_exact";
type TimeWindow = "dawn" | "morning" | "lunch" | "afternoon" | "evening" | "night";

type ParseIssueType =
  | "no_time_evidence"
  | "source_not_found"
  | "overlap"
  | "invalid_order"
  | "partial_time"
  | "other";

type ParsedEntry = {
  start: string | null;
  end: string | null;
  activity: string;
  energy?: number | null;
  focus?: number | null;
  note?: string | null;
  tags?: string[];
  confidence?: Confidence;
  source_text?: string | null;
  time_source?: TimeSource | null;
  time_confidence?: Confidence | null;
  time_window?: TimeWindow | null;
  crosses_midnight?: boolean;
};

type ParsedMeta = {
  mood?: Mood | null;
  sleep_quality?: number | null;
  sleep_hours?: number | null;
  stress_level?: number | null;
  parse_issues?: string[];
};

type ParseIssue = {
  raw: string;
  type: ParseIssueType;
  entryIndex: number | null;
  resolved: boolean;
};

type LogsResponse = {
  date: string;
  entries: unknown[];
  note: string | null;
  meta?: unknown;
};

type ParseDiaryResponse = {
  entries: ParsedEntry[];
  meta: ParsedMeta;
  ai_note: string;
};

type TrackEventType =
  | "ambiguity_shown"
  | "window_chip_selected"
  | "issue_viewed"
  | "issue_resolved"
  | "save_attempted"
  | "save_succeeded";

const SYSTEM_PARSE_NOTE_MARKERS = [
  "AI 파싱이 불안정하여 보수적으로 구조화했습니다.",
  "형식이 명확한 일기라 규칙 기반으로 빠르게 정리했습니다.",
  "AI parsing was unstable, so fallback parsing was conservative.",
  "The diary format was clear, so we applied fast rule-based structuring.",
  "AI解析が不安定だったため保守的に構造化しました。",
  "日記の形式が明確だったため、ルールベースで素早く構造化しました。",
  "AI 解析暂时不稳定，已采用保守结构化。",
  "日记格式较清晰，已使用规则快速结构化。",
  "El análisis de IA fue inestable, por lo que se aplicó un parsing conservador.",
  "El formato del diario era claro, así que aplicamos estructuración rápida por reglas.",
] as const;

function isSystemParseNote(note: string): boolean {
  const normalized = note.trim();
  if (!normalized) return false;
  return SYSTEM_PARSE_NOTE_MARKERS.some((marker) => normalized.includes(marker));
}

function shouldShowNonBlockingLoadWarning(err: unknown): boolean {
  if (!isApiFetchError(err)) return false;
  if (typeof err.status === "number" && err.status >= 500) return true;
  const message = (err.message || "").toLowerCase();
  return message.includes("supabase") || message.includes("request failed");
}



function isToday(dateStr: string): boolean {
  return dateStr === localYYYYMMDD();
}

function formatDateLabel(dateStr: string, isKo: boolean): string {
  const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  const days = isKo
    ? ["일", "월", "화", "수", "목", "금", "토"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayName = days[dt.getDay()];
  if (isKo) return `${m}월 ${d}일 (${dayName})`;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d} (${dayName})`;
}



const TIME_WINDOWS: TimeWindow[] = ["dawn", "morning", "lunch", "afternoon", "evening", "night"];

function parseIssueType(raw: string): ParseIssueType {
  const text = raw.toLowerCase();
  if (text.includes("no explicit time evidence") || text.includes("entry-level explicit evidence missing")) {
    return "no_time_evidence";
  }
  if (text.includes("source_text not found")) return "source_not_found";
  if (text.includes("overlap")) return "overlap";
  if (text.includes("end must be after start")) return "invalid_order";
  if (text.includes("partial time")) return "partial_time";
  return "other";
}

function parseIssueEntryIndex(raw: string): number | null {
  const match = /entry\[(\d+)\]/.exec(raw);
  if (!match) return null;
  const idx = Number(match[1]);
  if (!Number.isFinite(idx) || idx < 1) return null;
  return idx - 1;
}

function normalizeParseIssues(raw: unknown): ParseIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: ParseIssue[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !item.trim()) continue;
    out.push({
      raw: item.trim(),
      type: parseIssueType(item),
      entryIndex: parseIssueEntryIndex(item),
      resolved: false,
    });
  }
  return out;
}

function normalizeTimeSource(value: unknown): TimeSource | null {
  if (
    value === "explicit" ||
    value === "relative" ||
    value === "window" ||
    value === "unknown" ||
    value === "user_exact"
  ) {
    return value;
  }
  return null;
}

function normalizeTimeWindow(value: unknown): TimeWindow | null {
  if (
    value === "dawn" ||
    value === "morning" ||
    value === "lunch" ||
    value === "afternoon" ||
    value === "evening" ||
    value === "night"
  ) {
    return value;
  }
  return null;
}

function normalizeConfidence(value: unknown): Confidence | null {
  if (value === "high" || value === "medium" || value === "low") return value;
  return null;
}

function normalizeParsedEntries(raw: unknown): ParsedEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const src = item as Record<string, unknown>;
    const start = typeof src.start === "string" && /^\d{2}:\d{2}$/.test(src.start) ? src.start : null;
    const end = typeof src.end === "string" && /^\d{2}:\d{2}$/.test(src.end) ? src.end : null;
    const activity = typeof src.activity === "string" ? src.activity : "";
    if (!activity.trim()) continue;
    if ((start == null) !== (end == null)) continue;

    const energyRaw = Number(src.energy);
    const focusRaw = Number(src.focus);
    const energy = Number.isFinite(energyRaw) && energyRaw >= 1 && energyRaw <= 5 ? energyRaw : null;
    const focus = Number.isFinite(focusRaw) && focusRaw >= 1 && focusRaw <= 5 ? focusRaw : null;

    const note = typeof src.note === "string" ? src.note : null;
    const tags = Array.isArray(src.tags) ? src.tags.filter((v): v is string => typeof v === "string").slice(0, 12) : [];
    const confidenceRaw = typeof src.confidence === "string" ? src.confidence : "high";
    const confidence: Confidence =
      confidenceRaw === "low" || confidenceRaw === "medium" || confidenceRaw === "high" ? confidenceRaw : "high";
    const timeSource = normalizeTimeSource(src.time_source);
    const timeWindow = normalizeTimeWindow(src.time_window);
    const sourceText = typeof src.source_text === "string" ? src.source_text : null;
    const timeConfidence = normalizeConfidence(src.time_confidence);

    out.push({
      start,
      end,
      activity: activity.trim(),
      energy,
      focus,
      note,
      tags,
      confidence,
      source_text: sourceText,
      time_source: timeSource ?? (start && end ? "explicit" : timeWindow ? "window" : "unknown"),
      time_confidence: timeConfidence ?? (start && end ? "high" : "low"),
      time_window: timeWindow,
      crosses_midnight: Boolean(src.crosses_midnight),
    });
  }
  return out;
}

function normalizeParsedMeta(raw: unknown): ParsedMeta {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const mood =
    src.mood === "very_low" || src.mood === "low" || src.mood === "neutral" || src.mood === "good" || src.mood === "great"
      ? src.mood
      : null;
  const sleepQuality = Number(src.sleep_quality);
  const sleepHours = Number(src.sleep_hours);
  const stress = Number(src.stress_level);
  return {
    mood,
    sleep_quality: Number.isFinite(sleepQuality) && sleepQuality >= 1 && sleepQuality <= 5 ? sleepQuality : null,
    sleep_hours: Number.isFinite(sleepHours) && sleepHours >= 0 && sleepHours <= 14 ? sleepHours : null,
    stress_level: Number.isFinite(stress) && stress >= 1 && stress <= 5 ? stress : null,
    parse_issues: Array.isArray(src.parse_issues) ? src.parse_issues.filter((v): v is string => typeof v === "string") : [],
  };
}

function buildMetaPayload(meta: ParsedMeta): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (meta.mood) payload.mood = meta.mood;
  if (meta.sleep_quality != null) payload.sleep_quality = meta.sleep_quality;
  if (meta.stress_level != null) payload.stress_level = meta.stress_level;
  if (meta.parse_issues && meta.parse_issues.length > 0) payload.parse_issues = meta.parse_issues;
  return payload;
}

export default function DailyFlowPage() {
  const locale = useLocale();
  const isKo = locale === "ko";
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const t = React.useMemo(() => {
    if (isKo) {
      return {
        title: "Daily Flow",
        subtitle: "하루를 자유롭게 적으면 AI가 정리해요",
        today: "오늘",
        writeTitle: "오늘 하루를 돌아보며 자유롭게 적어주세요...",
        writeHint: "시간·활동·기분을 적으면 분석이 정확해져요",
        parse: "AI 분석하기",
        parsing: "분석 중...",
        confirmTitle: "AI가 정리한 결과예요",
        confirmSubtitle: "저장 전에 확인해 주세요",
        explicitTime: "명시 시간",
        windowTime: "시간대 기반",
        unknownTime: "확인 필요",
        noTimeInfo: "시간 정보 없음",
        timeWindowPrefix: "시간대",
        evidence: "원본",
        issueBannerTitle: "한번 확인하면 정확도가 올라가요",
        issueProgress: (current: number, total: number) => `확인 항목 ${current}/${total}`,
        reviewNow: "지금 확인",
        saveLater: "나중에 저장",
        unresolvedHint: (count: number) => `시간 미확정 항목 ${count}개가 남아 있어요`,
        lowConfidence: "추정 정확도 낮음",
        parsedMeta: "정리된 메타",
        edit: "수정하기",
        editEntry: "편집",
        confirmAndSave: "확인 & 저장",
        saving: "저장 중...",
        doneTitle: "저장 완료! AI 분석을 해볼까요?",
        doneHint: "오늘 기록으로 내일 계획을 만들어요.",
        analyze: "AI 분석",
        analyzing: "분석 중...",
        failedLoad: "불러오기 실패",
        loadWarning: "이전 기록을 잠시 불러오지 못했어요. 새 기록 작성은 정상적으로 가능합니다.",
        parseFailed: "일기 정리 실패",
        parseTimeout: "AI가 느려요. 잠시 후 다시 시도해 주세요.",
        parseSchemaInvalid: "AI가 불안정했어요. 다시 시도하면 보통 해결돼요.",
        parseUnavailable: "AI가 잠시 멈겼어요. 잠시 후 다시 시도해 주세요.",
        parseRetry: "다시 시도",
        saveFailed: "저장 실패",
        analyzeFailed: "분석 실패",
        needDiary: "일기를 10자 이상 입력해 주세요",
        needEntries: "저장할 정리 결과가 없어요",
        noEntries: "정리된 활동이 없어요. 일기를 좀 더 자세히 적어주세요.",
        invalidTime: (n: number) => `블록 #${n}: 시간 형식이 올바르지 않습니다`,
        endAfterStart: (n: number) => `블록 #${n}: 종료가 시작보다 빨라요`,
        overlap: (a: number, b: number) => `블록 #${a}과 #${b}의 시간이 겹칩니다`,
        mood: "기분",
        sleepQuality: "수면 질",
        sleepHours: "수면 시간",
        stress: "스트레스",
        retryParse: "다시 분석하기",
        retryParseHint: "결과가 어색하면 다시 분석해 보세요",
        aiSourceHint: (n: number) => `AI가 ${n}개 활동 블록을 파악했어요`,
        windowChip: {
          dawn: "새벽",
          morning: "아침",
          lunch: "점심",
          afternoon: "오후",
          evening: "저녁",
          night: "밤",
        },
        moods: {
          very_low: "매우 나쁨",
          low: "나쁨",
          neutral: "보통",
          good: "좋음",
          great: "매우 좋음",
        },
        noEvidence: "원본 없음",
        placeholder: "오늘 하루를 돌아보며 자유롭게 적어주세요...",
      };
    }
    return {
      title: "Daily Flow",
      subtitle: "Write a free diary and let AI turn it into structured blocks.",
      today: "Today",
      writeTitle: "Write your day freely...",
      writeHint: "Include time, activity, and mood for better parsing.",
      parse: "Parse with AI",
      parsing: "Parsing...",
      confirmTitle: "AI parsed your day like this",
      confirmSubtitle: "Review before saving",
      explicitTime: "Explicit time",
      windowTime: "Window-based",
      unknownTime: "Needs review",
      noTimeInfo: "No time information",
      timeWindowPrefix: "Window",
      evidence: "Evidence",
      issueBannerTitle: "A quick check makes this more accurate.",
      issueProgress: (current: number, total: number) => `Review item ${current}/${total}`,
      reviewNow: "Review now",
      saveLater: "Save later",
      unresolvedHint: (count: number) => `${count} entries are still time-unconfirmed.`,
      lowConfidence: "Low confidence",
      parsedMeta: "Parsed meta",
      edit: "Edit",
      editEntry: "Edit",
      confirmAndSave: "Confirm & Save",
      saving: "Saving...",
      doneTitle: "Saved! Start AI analysis?",
      doneHint: "Generate tomorrow's optimized routine from today's log.",
      analyze: "AI Analyze",
      analyzing: "Analyzing...",
      failedLoad: "Failed to load",
      loadWarning: "We couldn't load previous logs right now. You can still continue writing a new entry.",
      parseFailed: "Diary parsing failed",
      parseTimeout: "AI response timed out. Please retry in a moment.",
      parseSchemaInvalid: "AI returned an invalid format. Retrying usually fixes this.",
      parseUnavailable: "AI parsing service is temporarily unavailable. Please retry shortly.",
      parseRetry: "Retry parse",
      saveFailed: "Save failed",
      analyzeFailed: "Analyze failed",
      needDiary: "Please enter at least 10 characters",
      needEntries: "No parsed entries to save",
      noEntries: "No entries were parsed. Add a bit more detail to your diary.",
      invalidTime: (n: number) => `Block #${n}: invalid time format`,
      endAfterStart: (n: number) => `Block #${n}: end must be after start`,
      overlap: (a: number, b: number) => `Block #${a} and #${b} overlap`,
      mood: "Mood",
      sleepQuality: "Sleep quality",
      sleepHours: "Sleep hours",
      stress: "Stress",
      retryParse: "Re-parse",
      retryParseHint: "Not quite right? Try parsing again",
      aiSourceHint: (n: number) => `AI parsed ${n} activity block${n !== 1 ? "s" : ""}`,
      windowChip: {
        dawn: "Dawn",
        morning: "Morning",
        lunch: "Lunch",
        afternoon: "Afternoon",
        evening: "Evening",
        night: "Night",
      },
      moods: {
        very_low: "Very low",
        low: "Low",
        neutral: "Neutral",
        good: "Good",
        great: "Great",
      },
      noEvidence: "No evidence",
      placeholder: "Write freely about your day...",
    };
  }, [isKo]);

  const [mounted, setMounted] = React.useState(false);
  const [date, setDate] = React.useState("");
  const [step, setStep] = React.useState<FlowStep>("write");
  const [diaryText, setDiaryText] = React.useState("");
  const [parsedEntries, setParsedEntries] = React.useState<ParsedEntry[]>([]);
  const [parsedMeta, setParsedMeta] = React.useState<ParsedMeta>({});
  const [aiNote, setAiNote] = React.useState("");
  const [parseIssues, setParseIssues] = React.useState<ParseIssue[]>([]);
  const [focusedIssueIdx, setFocusedIssueIdx] = React.useState<number | null>(null);
  const [editingIdx, setEditingIdx] = React.useState<number | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loadWarning, setLoadWarning] = React.useState<string | null>(null);
  const [showParseRetry, setShowParseRetry] = React.useState(false);
  const [hasLocalDraft, setHasLocalDraft] = React.useState(false);
  const swipeStart = React.useRef<{ x: number; y: number } | null>(null);
  const diaryRef = React.useRef<HTMLTextAreaElement | null>(null);
  const entryRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const shownAmbiguityKeysRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    setDate(localYYYYMMDD());
    setMounted(true);
  }, []);

  useSWR<LogsResponse>(mounted && date ? `/logs?date=${date}` : null, apiFetch, {
    revalidateOnFocus: true,
    onSuccess: (data) => {
      if (parsing || saving || analyzing) return;
      if (hasLocalDraft) return;
      const entries = normalizeParsedEntries(data?.entries);
      const meta = normalizeParsedMeta(data?.meta);
      const issues = normalizeParseIssues(meta.parse_issues ?? []);
      setParsedEntries(entries);
      setParsedMeta(meta);
      setParseIssues(issues);
      setDiaryText(data?.note || "");
      setAiNote("");
      setEditingIdx(null);
      setFocusedIssueIdx(0);
      setStep(entries.length > 0 ? "confirm" : "write");
      setHasLocalDraft(false);
      setLoadWarning(null);
    },
    onError: (err) => {
      setHasLocalDraft(false);
      setParsedEntries([]);
      setParsedMeta({});
      setParseIssues([]);
      setStep("write");
      if (shouldShowNonBlockingLoadWarning(err)) {
        setLoadWarning(t.loadWarning);
        return;
      }
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setLoadWarning(err instanceof Error ? `${err.message}${hint}` : t.failedLoad);
    },
  });

  const autoResizeDiary = React.useCallback(() => {
    const el = diaryRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, 200)}px`;
  }, []);

  React.useEffect(() => {
    autoResizeDiary();
  }, [diaryText, autoResizeDiary]);

  const trackDailyFlowEvent = React.useCallback(
    async (
      eventType: TrackEventType,
      payload: {
        entry_id?: string;
        reason?: string;
        time_source?: string | null;
        time_confidence?: string | null;
        window_type?: string | null;
        issue_type?: string | null;
        resolution_action?: string | null;
        start_time?: string | null;
        end_time?: string | null;
        ambiguous_count?: number | null;
        resolved_issue_count?: number | null;
        has_source_text?: boolean | null;
      },
    ) => {
      try {
        await apiFetch<{ ok: boolean }>("/trends/cohort/event", {
          method: "POST",
          body: JSON.stringify({
            event_type: eventType,
            window_days: 1,
            compare_by: [],
            threshold_variant: "control",
            confidence_level: "low",
            preview_mode: false,
            cohort_size: 0,
            ...payload,
          }),
        });
      } catch {
        // best-effort analytics: never block the core flow
      }
    },
    [],
  );

  const unresolvedIssues = React.useMemo(() => parseIssues.filter((issue) => !issue.resolved), [parseIssues]);

  const focusedIssue = React.useMemo(() => {
    if (focusedIssueIdx == null) return unresolvedIssues[0] ?? null;
    const picked = unresolvedIssues[focusedIssueIdx];
    return picked ?? unresolvedIssues[0] ?? null;
  }, [focusedIssueIdx, unresolvedIssues]);

  const focusedIssueProgress = React.useMemo(() => {
    if (!focusedIssue || unresolvedIssues.length === 0) return null;
    const idx = unresolvedIssues.findIndex((issue) => issue.raw === focusedIssue.raw);
    return idx >= 0 ? idx + 1 : 1;
  }, [focusedIssue, unresolvedIssues]);

  const markIssuesResolvedForEntry = React.useCallback(
    async (entryIndex: number, resolutionAction: string) => {
      const candidates = parseIssues.filter((issue) => !issue.resolved && issue.entryIndex === entryIndex);
      if (candidates.length === 0) return;
      setHasLocalDraft(true);
      setParseIssues((prev) =>
        prev.map((issue) =>
          issue.entryIndex === entryIndex && !issue.resolved
            ? { ...issue, resolved: true }
            : issue,
        ),
      );
      for (const issue of candidates) {
        await trackDailyFlowEvent("issue_resolved", {
          entry_id: `entry-${entryIndex}`,
          issue_type: issue.type,
          resolution_action: resolutionAction,
        });
      }
      setFocusedIssueIdx(0);
    },
    [parseIssues, trackDailyFlowEvent],
  );

  const focusIssue = React.useCallback(
    async (issue: ParseIssue | null) => {
      if (!issue) return;
      if (issue.entryIndex == null) return;
      const el = entryRefs.current[issue.entryIndex];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      await trackDailyFlowEvent("issue_viewed", {
        entry_id: `entry-${issue.entryIndex}`,
        issue_type: issue.type,
      });
    },
    [trackDailyFlowEvent],
  );

  function resetFlowState(): void {
    setStep("write");
    setDiaryText("");
    setParsedEntries([]);
    setParsedMeta({});
    setAiNote("");
    setParseIssues([]);
    setFocusedIssueIdx(null);
    setError(null);
    setLoadWarning(null);
    setShowParseRetry(false);
    setEditingIdx(null);
    setHasLocalDraft(false);
  }

  function navigateDate(delta: number): void {
    if (!date) return;
    setDate(addDays(date, delta));
    resetFlowState();
  }

  function goToday(): void {
    const today = localYYYYMMDD();
    setDate(today);
    resetFlowState();
  }

  function validateEntries(list: ParsedEntry[]): string | null {
    for (const [idx, e] of list.entries()) {
      if (e.start == null && e.end == null) continue;
      if ((e.start == null) !== (e.end == null)) return t.invalidTime(idx + 1);
      const s = toMinutes(e.start);
      const en = toMinutes(e.end);
      if (s == null || en == null) return t.invalidTime(idx + 1);
      if (en <= s && !e.crosses_midnight) return t.endAfterStart(idx + 1);
    }
    const sorted = list
      .map((e, i) => ({ i, s: toMinutes(e.start), en: toMinutes(e.end), crosses: Boolean(e.crosses_midnight) }))
      .filter((x): x is { i: number; s: number; en: number; crosses: boolean } => x.s != null && x.en != null && !x.crosses)
      .sort((a, b) => a.s - b.s);
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (!prev || !cur) continue;
      if (cur.s < prev.en) return t.overlap(prev.i + 1, cur.i + 1);
    }
    return null;
  }

  function buildLogPayload() {
    const unresolved = parseIssues.filter((issue) => !issue.resolved).map((issue) => issue.raw);
    const payload = {
      date,
      entries: parsedEntries.map((e) => ({
        start: e.start ?? null,
        end: e.end ?? null,
        activity: e.activity.trim().slice(0, 120),
        energy: e.energy ?? null,
        focus: e.focus ?? null,
        confidence: e.confidence ?? "high",
        note: (e.note || "").slice(0, 280) || null,
        tags: Array.isArray(e.tags) ? e.tags.slice(0, 12) : [],
        source_text: e.source_text || null,
        time_source: e.time_source ?? (e.start && e.end ? "explicit" : "unknown"),
        time_confidence: e.time_confidence ?? (e.start && e.end ? "high" : "low"),
        time_window: e.time_window ?? null,
        crosses_midnight: Boolean(e.crosses_midnight),
      })),
      note: diaryText.trim().slice(0, 5000) || null,
      meta: buildMetaPayload({ ...parsedMeta, parse_issues: unresolved }),
    };
    return payload;
  }

  function updateParsedEntry(idx: number, patch: Partial<ParsedEntry>) {
    setHasLocalDraft(true);
    setParsedEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }

  function entryTimeState(entry: ParsedEntry): "explicit" | "window" | "unknown" {
    if (entry.start && entry.end) return "explicit";
    if (entry.time_source === "window" || entry.time_window) return "window";
    return "unknown";
  }

  function timeWindowLabel(value: TimeWindow | null | undefined): string {
    if (!value) return "-";
    return t.windowChip[value];
  }

  function displayEvidence(entry: ParsedEntry): string {
    const text = (entry.source_text || entry.activity || "").trim();
    if (!text) return t.noEvidence;
    return text.length > 42 ? `${text.slice(0, 42)}...` : text;
  }

  function entryTimeHeadline(entry: ParsedEntry): string {
    const state = entryTimeState(entry);
    if (state === "explicit" && entry.start && entry.end) {
      return `${entry.start} - ${entry.end}`;
    }
    if (state === "window") {
      return `${t.timeWindowPrefix}: ${timeWindowLabel(entry.time_window)}`;
    }
    return t.noTimeInfo;
  }

  function entryTimeLabel(entry: ParsedEntry): string {
    const state = entryTimeState(entry);
    if (state === "explicit") return t.explicitTime;
    if (state === "window") return t.windowTime;
    return t.unknownTime;
  }

  async function setWindowForEntry(idx: number, windowValue: TimeWindow): Promise<void> {
    updateParsedEntry(idx, {
      time_window: windowValue,
      time_source: "window",
      time_confidence: "low",
      start: null,
      end: null,
      crosses_midnight: false,
    });
    await trackDailyFlowEvent("window_chip_selected", {
      entry_id: `entry-${idx}`,
      window_type: windowValue,
      time_source: "window",
      time_confidence: "low",
    });
    await markIssuesResolvedForEntry(idx, "window");
  }

  async function setExactTimeForEntry(idx: number, startValue: string | null, endValue: string | null): Promise<void> {
    const hasStart = Boolean(startValue && /^\d{2}:\d{2}$/.test(startValue));
    const hasEnd = Boolean(endValue && /^\d{2}:\d{2}$/.test(endValue));
    if (hasStart && hasEnd) {
      updateParsedEntry(idx, {
        start: startValue,
        end: endValue,
        time_source: "user_exact",
        time_confidence: "high",
        time_window: null,
      });
      await markIssuesResolvedForEntry(idx, "exact_time");
      return;
    }
    if (!startValue && !endValue) {
      updateParsedEntry(idx, {
        start: null,
        end: null,
        time_source: "unknown",
        time_confidence: "low",
      });
      return;
    }
    updateParsedEntry(idx, {
      start: startValue,
      end: endValue,
      time_source: "unknown",
      time_confidence: "low",
    });
  }

  async function parseDiary(): Promise<void> {
    if (!date) return;
    setError(null);
    setShowParseRetry(false);
    if (diaryText.trim().length < 10) {
      setError(t.needDiary);
      return;
    }
    setParsing(true);
    try {
      const res = await apiFetch<ParseDiaryResponse>("/parse-diary", {
        method: "POST",
        timeoutMs: 40_000,
        body: JSON.stringify({
          date,
          diary_text: diaryText.trim(),
        }),
      });
      const normalizedEntries = normalizeParsedEntries(res.entries);
      const normalizedMeta = normalizeParsedMeta(res.meta);
      const issues = normalizeParseIssues(normalizedMeta.parse_issues ?? []);
      setParsedEntries(normalizedEntries);
      setParsedMeta(normalizedMeta);
      setParseIssues(issues);
      setFocusedIssueIdx(0);
      setAiNote(
        typeof res.ai_note === "string" && !isSystemParseNote(res.ai_note)
          ? res.ai_note
          : "",
      );
      setStep("confirm");
      setHasLocalDraft(true);
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      const parseCode = isApiFetchError(err) ? err.code : undefined;
      const retryable = isApiFetchError(err) && (err.code === "PARSE_UPSTREAM_TIMEOUT" || err.code === "PARSE_UPSTREAM_HTTP_ERROR" || err.code === "PARSE_SCHEMA_INVALID");
      setShowParseRetry(Boolean(retryable));
      if (parseCode === "PARSE_UPSTREAM_TIMEOUT") {
        setError(`${t.parseTimeout}${hint}`);
      } else if (parseCode === "PARSE_SCHEMA_INVALID") {
        setError(`${t.parseSchemaInvalid}${hint}`);
      } else if (parseCode === "PARSE_UPSTREAM_HTTP_ERROR") {
        setError(`${t.parseUnavailable}${hint}`);
      } else {
        setError(err instanceof Error ? `${t.parseFailed}: ${err.message}${hint}` : t.parseFailed);
      }
    } finally {
      setParsing(false);
    }
  }

  async function save(): Promise<void> {
    if (!date) return;
    setError(null);
    setLoadWarning(null);
    setShowParseRetry(false);
    if (!parsedEntries.length) {
      setError(t.needEntries);
      return;
    }
    const validationError = validateEntries(parsedEntries);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    const resolvedCount = parseIssues.filter((issue) => issue.resolved).length;
    await trackDailyFlowEvent("save_attempted", {
      ambiguous_count: parsedEntries.filter((entry) => entryTimeState(entry) !== "explicit").length,
      resolved_issue_count: resolvedCount,
    });
    const payload = buildLogPayload();
    await mutate(`/logs?date=${date}`, payload, false);
    try {
      await apiFetch("/logs", { method: "POST", timeoutMs: 20_000, body: JSON.stringify(payload) });
      await mutate(`/logs?date=${date}`);
      await trackDailyFlowEvent("save_succeeded", {
        ambiguous_count: parsedEntries.filter((entry) => entryTimeState(entry) !== "explicit").length,
        resolved_issue_count: resolvedCount,
      });
      setHasLocalDraft(false);
      setStep("done");
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setError(err instanceof Error ? `${err.message}${hint}` : t.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function saveAndAnalyze(options?: { skipSave?: boolean }): Promise<void> {
    if (!date) return;
    setError(null);
    setLoadWarning(null);
    setShowParseRetry(false);

    if (!options?.skipSave) {
      if (!parsedEntries.length) {
        setError(t.needEntries);
        return;
      }
      const validationError = validateEntries(parsedEntries);
      if (validationError) {
        setError(validationError);
        return;
      }
      setSaving(true);
      const resolvedCount = parseIssues.filter((issue) => issue.resolved).length;
      await trackDailyFlowEvent("save_attempted", {
        ambiguous_count: parsedEntries.filter((entry) => entryTimeState(entry) !== "explicit").length,
        resolved_issue_count: resolvedCount,
      });
      const payload = buildLogPayload();
      try {
        await apiFetch("/logs", { method: "POST", timeoutMs: 20_000, body: JSON.stringify(payload) });
        await mutate(`/logs?date=${date}`);
        await trackDailyFlowEvent("save_succeeded", {
          ambiguous_count: parsedEntries.filter((entry) => entryTimeState(entry) !== "explicit").length,
          resolved_issue_count: resolvedCount,
        });
        setHasLocalDraft(false);
      } catch (err) {
        const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
        setError(err instanceof Error ? `${err.message}${hint}` : t.saveFailed);
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    setAnalyzing(true);
    try {
      await apiFetch("/analyze", { method: "POST", timeoutMs: 45_000, body: JSON.stringify({ date, force: true }) });
      router.push(`/app/reports/${date}`);
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setError(err instanceof Error ? `${err.message}${hint}` : t.analyzeFailed);
    } finally {
      setAnalyzing(false);
    }
  }

  const isBusy = parsing || saving || analyzing;
  const canParse = diaryText.trim().length >= 10 && !isBusy;

  const parsedMetaRows = React.useMemo(() => {
    const rows: Array<{ label: string; value: string }> = [];
    if (parsedMeta.mood) rows.push({ label: t.mood, value: t.moods[parsedMeta.mood] });
    if (parsedMeta.sleep_quality != null) rows.push({ label: t.sleepQuality, value: String(parsedMeta.sleep_quality) });
    if (parsedMeta.stress_level != null) rows.push({ label: t.stress, value: String(parsedMeta.stress_level) });
    return rows;
  }, [parsedMeta, t]);

  React.useEffect(() => {
    if (step !== "confirm") return;
    parsedEntries.forEach((entry, idx) => {
      const state = entryTimeState(entry);
      if (state === "explicit") return;
      const key = `${date}-${idx}-${state}-${entry.activity}`;
      if (shownAmbiguityKeysRef.current.has(key)) return;
      shownAmbiguityKeysRef.current.add(key);
      void trackDailyFlowEvent("ambiguity_shown", {
        entry_id: `entry-${idx}`,
        reason: state === "window" ? "window_based" : "no_time_information",
        time_source: entry.time_source ?? state,
        time_confidence: entry.time_confidence ?? "low",
        has_source_text: Boolean(entry.source_text),
      });
    });
  }, [date, parsedEntries, step, trackDailyFlowEvent]);

  if (!mounted || !date) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5 pb-bottom-safe md:pb-6">
        <div>
          <h1 className="title-serif text-3xl">{t.title}</h1>
          <p className="mt-1 text-sm text-mutedFg">{t.subtitle}</p>
        </div>
        <div className="rounded-xl border bg-white/60 px-4 py-10 text-center text-sm text-mutedFg">
          {isKo ? "불러오는 중..." : "Loading..."}
        </div>
      </div>
    );
  }

  return (
    <div
      className="mx-auto w-full max-w-3xl space-y-5 pb-bottom-safe md:pb-6"
      onTouchStart={(e) => {
        const touch = e.touches[0];
        if (!touch) return;
        swipeStart.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(e) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        const touch = e.changedTouches[0];
        if (!start || !touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) < 90 || Math.abs(dy) > 70) return;
        navigateDate(dx < 0 ? 1 : -1);
      }}
    >
      <div className="space-y-4">
        <div>
          <h1 className="title-serif text-3xl">{t.title}</h1>
          <p className="mt-1 text-sm text-mutedFg">{t.subtitle}</p>
        </div>

        <div className="flex items-center justify-between rounded-xl border bg-white/60 px-3 py-2 backdrop-blur">
          <Button variant="ghost" size="icon" onClick={() => navigateDate(-1)} aria-label="Previous day">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex flex-col items-center gap-0.5">
            <button className="text-lg font-semibold tracking-tight transition-colors hover:text-brand" onClick={goToday}>
              {formatDateLabel(date, isKo)}
            </button>
            {isToday(date) ? <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">{t.today}</span> : null}
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigateDate(1)} aria-label="Next day">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="whitespace-pre-line">{error}</p>
          {showParseRetry ? (
            <div className="mt-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => void parseDiary()} disabled={isBusy}>
                <Sparkles className={`mr-1.5 h-4 w-4 ${parsing ? "animate-pulse" : ""}`} />
                {parsing ? t.parsing : t.parseRetry}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {loadWarning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {loadWarning}
        </div>
      ) : null}

      {step === "write" ? (
        <div className="space-y-3 rounded-xl border bg-white/60 p-4 write-area-bg">
          <Textarea
            id="diary-input"
            ref={diaryRef}
            value={diaryText}
            onChange={(e) => {
              setDiaryText(e.target.value);
              setHasLocalDraft(true);
            }}
            aria-label={t.writeTitle}
            placeholder={t.placeholder}
            className="min-h-[180px] resize-none bg-white/80"
          />
          <p className="text-xs text-mutedFg">{t.writeHint}</p>
          <div className="flex justify-end">
            <Button onClick={parseDiary} disabled={!canParse}>
              <Sparkles className={`mr-1.5 h-4 w-4 ${parsing ? "animate-pulse" : ""}`} />
              {parsing ? t.parsing : t.parse}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "confirm" ? (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{t.confirmTitle}</h2>
                <p className="mt-0.5 text-xs text-mutedFg">{t.confirmSubtitle}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void parseDiary()} disabled={isBusy} title={t.retryParseHint}>
                <Sparkles className={`mr-1 h-3.5 w-3.5 ${parsing ? "animate-pulse" : ""}`} />
                {parsing ? t.parsing : t.retryParse}
              </Button>
            </div>
            {parsedEntries.length > 0 ? (
              <p className="mt-2 text-[11px] text-mutedFg">{t.aiSourceHint(parsedEntries.length)}</p>
            ) : null}
          </div>

          {parsedEntries.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t.noEntries}</div>
          ) : (
            <div className="space-y-2">
              {unresolvedIssues.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
                  <p className="font-medium">{t.issueBannerTitle}</p>
                  <p className="mt-0.5 text-xs text-amber-900/80">
                    {t.issueProgress(focusedIssueProgress ?? 1, unresolvedIssues.length)}
                  </p>
                  {focusedIssue ? (
                    <p className="mt-1 text-xs text-amber-900/75">{focusedIssue.raw}</p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void focusIssue(focusedIssue);
                      }}
                    >
                      {t.reviewNow}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setFocusedIssueIdx(null)}>
                      {t.saveLater}
                    </Button>
                  </div>
                </div>
              ) : null}

              {parsedEntries.map((entry, idx) => {
                const lowConfidence = entry.confidence === "low";
                const isEditing = editingIdx === idx;
                const timeState = entryTimeState(entry);
                const isFocusedIssue = focusedIssue?.entryIndex === idx;
                return (
                  <div
                    key={`${entry.start ?? "na"}-${entry.end ?? "na"}-${idx}`}
                    ref={(el) => {
                      entryRefs.current[idx] = el;
                    }}
                    className={`rounded-xl border p-4 ${isFocusedIssue ? "border-brand bg-brand/5" : lowConfidence ? "border-amber-300 bg-amber-50/80" : "bg-white/70"
                      }`}
                    onBlur={(e) => {
                      if (!isEditing) return;
                      const next = e.relatedTarget;
                      if (next instanceof Node && e.currentTarget.contains(next)) return;
                      setEditingIdx(null);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {isEditing ? (
                          <div className="flex items-center gap-2 text-xs text-mutedFg">
                            <Clock className="h-3.5 w-3.5" />
                            <input
                              type="time"
                              value={entry.start ?? ""}
                              onChange={(e) => {
                                const nextStart = e.target.value || null;
                                const nextEnd = entry.end ?? null;
                                void setExactTimeForEntry(idx, nextStart, nextEnd);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") setEditingIdx(null);
                              }}
                              className="h-8 rounded-md border bg-white px-2 text-xs"
                            />
                            <span>-</span>
                            <input
                              type="time"
                              value={entry.end ?? ""}
                              onChange={(e) => {
                                const nextStart = entry.start ?? null;
                                const nextEnd = e.target.value || null;
                                void setExactTimeForEntry(idx, nextStart, nextEnd);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") setEditingIdx(null);
                              }}
                              className="h-8 rounded-md border bg-white px-2 text-xs"
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-mutedFg">
                            <Clock className="mr-1 inline h-3.5 w-3.5" />
                            <span className="font-medium">{entryTimeHeadline(entry)}</span>
                            <span className="ml-2 rounded-full border px-2 py-0.5 text-[10px]">
                              {entryTimeLabel(entry)}
                            </span>
                          </p>
                        )}
                        {isEditing ? (
                          <input
                            type="text"
                            value={entry.activity}
                            onChange={(e) => updateParsedEntry(idx, { activity: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") setEditingIdx(null);
                            }}
                            className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm font-medium"
                          />
                        ) : (
                          <p className="mt-1 font-medium">{entry.activity}</p>
                        )}
                        {entry.note ? <p className="mt-1 text-xs text-mutedFg">{entry.note}</p> : null}
                        {entry.tags && entry.tags.length > 0 ? (
                          <p className="mt-1 text-[11px] text-mutedFg">#{entry.tags.join(" #")}</p>
                        ) : null}
                        <p className="mt-2 text-xs text-mutedFg">
                          {t.evidence}: <span className="font-medium">{displayEvidence(entry)}</span>
                        </p>
                        {timeState !== "explicit" ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {TIME_WINDOWS.map((windowValue) => (
                              <button
                                key={`${idx}-${windowValue}`}
                                type="button"
                                onClick={() => {
                                  void setWindowForEntry(idx, windowValue);
                                }}
                                className={`rounded-full border px-2.5 py-1 text-[11px] ${entry.time_window === windowValue ? "border-brand bg-brand/10 text-brand" : "bg-white text-mutedFg"
                                  }`}
                              >
                                {t.windowChip[windowValue]}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right text-xs text-mutedFg">
                        <button
                          type="button"
                          onClick={() => setEditingIdx((prev) => (prev === idx ? null : idx))}
                          className="mb-2 inline-flex items-center gap-1 rounded-full border bg-white px-2 py-1 text-[11px] font-medium text-mutedFg hover:text-fg"
                        >
                          <Pencil className="h-3 w-3" />
                          {t.editEntry}
                        </button>
                        {entry.crosses_midnight ? <p className="mb-1 text-[10px] text-mutedFg">+1 day</p> : null}
                        {entry.energy != null ? (
                          <p>
                            <Zap className="mr-1 inline h-3.5 w-3.5" />
                            {entry.energy}
                          </p>
                        ) : null}
                        {entry.focus != null ? (
                          <p className="mt-1">
                            <Target className="mr-1 inline h-3.5 w-3.5" />
                            {entry.focus}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {lowConfidence ? <p className="mt-2 text-[11px] font-medium text-amber-800">{t.lowConfidence}</p> : null}
                  </div>
                );
              })}
            </div>
          )}

          {parsedMetaRows.length > 0 ? (
            <div className="rounded-xl border bg-white/60 p-4">
              <p className="text-sm font-medium">{t.parsedMeta}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {parsedMetaRows.map((row) => (
                  <span key={row.label} className="rounded-full border bg-white px-3 py-1 text-xs">
                    {row.label}: {row.value}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {aiNote.trim() ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4 text-sm text-blue-900">{aiNote}</div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setStep("write")} disabled={isBusy}>
              {t.edit}
            </Button>
            {unresolvedIssues.length > 0 ? (
              <span className="text-xs text-mutedFg">{t.unresolvedHint(unresolvedIssues.length)}</span>
            ) : null}
            <Button onClick={save} disabled={isBusy || parsedEntries.length === 0}>
              {saving ? t.saving : t.confirmAndSave}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
          <p className="font-medium text-emerald-900">{t.doneTitle}</p>
          <p className="mt-1 text-xs text-emerald-800/80">{t.doneHint}</p>
          <div className="mt-3 flex justify-end">
            <Button onClick={() => void saveAndAnalyze({ skipSave: true })} disabled={isBusy}>
              <Sparkles className={`mr-1.5 h-4 w-4 ${analyzing ? "animate-pulse" : ""}`} />
              {analyzing ? t.analyzing : t.analyze}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
