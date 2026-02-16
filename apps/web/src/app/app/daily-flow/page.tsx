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

type FlowStep = "write" | "confirm" | "done";

type Mood = "very_low" | "low" | "neutral" | "good" | "great";
type Confidence = "high" | "medium" | "low";

type ParsedEntry = {
  start: string;
  end: string;
  activity: string;
  energy?: number | null;
  focus?: number | null;
  note?: string | null;
  tags?: string[];
  confidence?: Confidence;
};

type ParsedMeta = {
  mood?: Mood | null;
  sleep_quality?: number | null;
  sleep_hours?: number | null;
  stress_level?: number | null;
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

function localYYYYMMDD(d = new Date()): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return localYYYYMMDD(dt);
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

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function normalizeParsedEntries(raw: unknown): ParsedEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const src = item as Record<string, unknown>;
    const start = typeof src.start === "string" ? src.start : "";
    const end = typeof src.end === "string" ? src.end : "";
    const activity = typeof src.activity === "string" ? src.activity : "";
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || !activity.trim()) continue;

    const energyRaw = Number(src.energy);
    const focusRaw = Number(src.focus);
    const energy = Number.isFinite(energyRaw) && energyRaw >= 1 && energyRaw <= 5 ? energyRaw : null;
    const focus = Number.isFinite(focusRaw) && focusRaw >= 1 && focusRaw <= 5 ? focusRaw : null;

    const note = typeof src.note === "string" ? src.note : null;
    const tags = Array.isArray(src.tags) ? src.tags.filter((v): v is string => typeof v === "string").slice(0, 12) : [];
    const confidenceRaw = typeof src.confidence === "string" ? src.confidence : "high";
    const confidence: Confidence =
      confidenceRaw === "low" || confidenceRaw === "medium" || confidenceRaw === "high" ? confidenceRaw : "high";

    out.push({
      start,
      end,
      activity: activity.trim(),
      energy,
      focus,
      note,
      tags,
      confidence,
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
  };
}

function buildMetaPayload(meta: ParsedMeta): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (meta.mood) payload.mood = meta.mood;
  if (meta.sleep_quality != null) payload.sleep_quality = meta.sleep_quality;
  if (meta.sleep_hours != null) payload.sleep_hours = meta.sleep_hours;
  if (meta.stress_level != null) payload.stress_level = meta.stress_level;
  return payload;
}

function moodLabel(mood: Mood, isKo: boolean): string {
  const ko: Record<Mood, string> = {
    very_low: "매우 낮음",
    low: "낮음",
    neutral: "보통",
    good: "좋음",
    great: "매우 좋음",
  };
  const en: Record<Mood, string> = {
    very_low: "Very low",
    low: "Low",
    neutral: "Neutral",
    good: "Good",
    great: "Great",
  };
  return isKo ? ko[mood] : en[mood];
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
        subtitle: "자유 일기를 쓰면 AI가 활동 블록으로 정리해줘요",
        today: "오늘",
        writeTitle: "오늘 하루를 돌아보며 자유롭게 적어주세요...",
        writeHint: "시간, 활동, 기분을 포함하면 더 정확한 분석이 가능해요",
        parse: "AI 분석하기",
        parsing: "분석 중...",
        confirmTitle: "AI가 이렇게 파악했어요",
        confirmSubtitle: "저장 전에 결과를 확인해 주세요",
        lowConfidence: "추정 정확도 낮음",
        parsedMeta: "파싱된 메타",
        edit: "수정하기",
        editEntry: "편집",
        confirmAndSave: "확인 & 저장",
        saving: "저장 중...",
        doneTitle: "저장 완료! AI 분석을 시작할까요?",
        doneHint: "오늘 기록을 기반으로 내일 루틴을 생성합니다.",
        analyze: "AI 분석",
        analyzing: "분석 중...",
        failedLoad: "불러오기 실패",
      parseFailed: "일기 파싱 실패",
      parseTimeout: "AI 응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.",
      parseSchemaInvalid: "AI 응답 형식이 불안정했습니다. 다시 시도하면 대부분 해결됩니다.",
      parseUnavailable: "AI 파싱 서비스가 일시적으로 불안정합니다. 잠시 후 다시 시도해 주세요.",
      parseRetry: "다시 시도",
      saveFailed: "저장 실패",
      analyzeFailed: "분석 실패",
        needDiary: "일기를 10자 이상 입력해 주세요",
        needEntries: "저장할 파싱 결과가 없습니다",
        noEntries: "파싱된 활동이 없습니다. 일기를 조금 더 구체적으로 작성해 주세요.",
        invalidTime: (n: number) => `블록 #${n}: 시간 형식이 올바르지 않습니다`,
        endAfterStart: (n: number) => `블록 #${n}: 종료가 시작보다 빨라요`,
        overlap: (a: number, b: number) => `블록 #${a}과 #${b}의 시간이 겹칩니다`,
        mood: "기분",
        sleepQuality: "수면 질",
        sleepHours: "수면 시간",
        stress: "스트레스",
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
    };
  }, [isKo]);

  const [date, setDate] = React.useState(() => localYYYYMMDD());
  const [step, setStep] = React.useState<FlowStep>("write");
  const [diaryText, setDiaryText] = React.useState("");
  const [parsedEntries, setParsedEntries] = React.useState<ParsedEntry[]>([]);
  const [parsedMeta, setParsedMeta] = React.useState<ParsedMeta>({});
  const [aiNote, setAiNote] = React.useState("");
  const [editingIdx, setEditingIdx] = React.useState<number | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showParseRetry, setShowParseRetry] = React.useState(false);
  const swipeStart = React.useRef<{ x: number; y: number } | null>(null);
  const diaryRef = React.useRef<HTMLTextAreaElement | null>(null);

  useSWR<LogsResponse>(`/logs?date=${date}`, apiFetch, {
    revalidateOnFocus: true,
    onSuccess: (data) => {
      if (parsing || saving || analyzing) return;
      const entries = normalizeParsedEntries(data?.entries);
      const meta = normalizeParsedMeta(data?.meta);
      setParsedEntries(entries);
      setParsedMeta(meta);
      setDiaryText(data?.note || "");
      setAiNote("");
      setEditingIdx(null);
      setStep(entries.length > 0 ? "confirm" : "write");
    },
    onError: (err) => {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setError(err instanceof Error ? `${err.message}${hint}` : t.failedLoad);
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

  function resetFlowState(): void {
    setStep("write");
    setDiaryText("");
    setParsedEntries([]);
    setParsedMeta({});
    setAiNote("");
    setError(null);
    setShowParseRetry(false);
    setEditingIdx(null);
  }

  function navigateDate(delta: number): void {
    setDate(addDays(date, delta));
    resetFlowState();
  }

  function goToday(): void {
    setDate(localYYYYMMDD());
    resetFlowState();
  }

  function validateEntries(list: ParsedEntry[]): string | null {
    for (const [idx, e] of list.entries()) {
      const s = toMinutes(e.start);
      const en = toMinutes(e.end);
      if (s == null || en == null) return t.invalidTime(idx + 1);
      if (en <= s) return t.endAfterStart(idx + 1);
    }
    const sorted = list
      .map((e, i) => ({ i, s: toMinutes(e.start) ?? 0, en: toMinutes(e.end) ?? 0 }))
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
    const payload = {
      date,
      entries: parsedEntries.map((e) => ({
        start: e.start,
        end: e.end,
        activity: e.activity.trim().slice(0, 120),
        energy: e.energy ?? null,
        focus: e.focus ?? null,
        confidence: e.confidence ?? "high",
        note: (e.note || "").slice(0, 280) || null,
        tags: Array.isArray(e.tags) ? e.tags.slice(0, 12) : [],
      })),
      note: diaryText.trim().slice(0, 5000) || null,
      meta: buildMetaPayload(parsedMeta),
    };
    return payload;
  }

  function updateParsedEntry(idx: number, patch: Partial<ParsedEntry>) {
    setParsedEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }

  async function parseDiary(): Promise<void> {
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
        body: JSON.stringify({
          date,
          diary_text: diaryText.trim(),
        }),
      });
      setParsedEntries(normalizeParsedEntries(res.entries));
      setParsedMeta(normalizeParsedMeta(res.meta));
      setAiNote(typeof res.ai_note === "string" ? res.ai_note : "");
      setStep("confirm");
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
    setError(null);
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
    const payload = buildLogPayload();
    await mutate(`/logs?date=${date}`, payload, false);
    try {
      await apiFetch("/logs", { method: "POST", body: JSON.stringify(payload) });
      await mutate(`/logs?date=${date}`);
      setStep("done");
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setError(err instanceof Error ? `${err.message}${hint}` : t.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function saveAndAnalyze(options?: { skipSave?: boolean }): Promise<void> {
    setError(null);
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
      const payload = buildLogPayload();
      try {
        await apiFetch("/logs", { method: "POST", body: JSON.stringify(payload) });
        await mutate(`/logs?date=${date}`);
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
      await apiFetch("/analyze", { method: "POST", body: JSON.stringify({ date, force: true }) });
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
    if (parsedMeta.mood) rows.push({ label: t.mood, value: moodLabel(parsedMeta.mood, isKo) });
    if (parsedMeta.sleep_quality != null) rows.push({ label: t.sleepQuality, value: String(parsedMeta.sleep_quality) });
    if (parsedMeta.sleep_hours != null) rows.push({ label: t.sleepHours, value: String(parsedMeta.sleep_hours) });
    if (parsedMeta.stress_level != null) rows.push({ label: t.stress, value: String(parsedMeta.stress_level) });
    return rows;
  }, [parsedMeta, t, isKo]);

  return (
    <div
      className="mx-auto w-full max-w-3xl space-y-5 pb-24 md:pb-6"
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

        <div className="flex items-center justify-between rounded-xl border bg-white/60 px-2 py-2 backdrop-blur">
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

      {step === "write" ? (
        <div className="space-y-3 rounded-xl border bg-white/60 p-4">
          <Label className="text-sm font-medium">{t.writeTitle}</Label>
          <Textarea
            ref={diaryRef}
            value={diaryText}
            onChange={(e) => setDiaryText(e.target.value)}
            placeholder={isKo ? "오늘 하루를 돌아보며 자유롭게 적어주세요..." : "Write freely about your day..."}
            className="min-h-[200px] resize-none bg-white"
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
            <h2 className="text-base font-semibold">{t.confirmTitle}</h2>
            <p className="mt-0.5 text-xs text-mutedFg">{t.confirmSubtitle}</p>
          </div>

          {parsedEntries.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t.noEntries}</div>
          ) : (
            <div className="space-y-2">
              {parsedEntries.map((entry, idx) => {
                const lowConfidence = entry.confidence === "low";
                const isEditing = editingIdx === idx;
                return (
                  <div
                    key={`${entry.start}-${entry.end}-${idx}`}
                    className={`rounded-xl border p-4 ${lowConfidence ? "border-amber-300 bg-amber-50/80" : "bg-white/70"}`}
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
                              value={entry.start}
                              onChange={(e) => updateParsedEntry(idx, { start: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") setEditingIdx(null);
                              }}
                              className="h-8 rounded-md border bg-white px-2 text-xs"
                            />
                            <span>-</span>
                            <input
                              type="time"
                              value={entry.end}
                              onChange={(e) => updateParsedEntry(idx, { end: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") setEditingIdx(null);
                              }}
                              className="h-8 rounded-md border bg-white px-2 text-xs"
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-mutedFg">
                            <Clock className="mr-1 inline h-3.5 w-3.5" />
                            {entry.start} - {entry.end}
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
