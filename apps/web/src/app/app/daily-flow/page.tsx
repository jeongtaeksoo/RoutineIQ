"use client";

import * as React from "react";
import { Plus, Copy, Save, ChevronLeft, ChevronRight, Sparkles, Clock, NotebookPen } from "lucide-react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, isApiFetchError } from "@/lib/api-client";
import { DAILY_FLOW_TEMPLATES, type DailyFlowEntry, DEFAULT_TEMPLATE_NAME } from "@/lib/daily-flow-templates";
import { createClient } from "@/lib/supabase/client";
import { DailyEntryRow, DailyEntrySkeleton } from "./entry-row";

/* ─── Types and Helpers ─── */
type Entry = DailyFlowEntry;
type DailyMeta = {
  mood?: "very_low" | "low" | "neutral" | "good" | "great" | null;
  sleep_quality?: number | null;
  sleep_hours?: number | null;
  stress_level?: number | null;
  hydration_level?: "low" | "ok" | "great" | null;
  water_intake_ml?: number | null;
  micro_habit_done?: boolean | null;
};

const EMPTY_META: DailyMeta = {
  mood: null,
  sleep_quality: null,
  sleep_hours: null,
  stress_level: null,
  hydration_level: null,
  water_intake_ml: null,
  micro_habit_done: null,
};

function normalizeMeta(raw: unknown): DailyMeta {
  if (!raw || typeof raw !== "object") return { ...EMPTY_META };
  const src = raw as Record<string, unknown>;
  const mood =
    src.mood === "very_low" || src.mood === "low" || src.mood === "neutral" || src.mood === "good" || src.mood === "great"
      ? src.mood
      : null;
  const sleepQuality = Number.isFinite(Number(src.sleep_quality)) ? Number(src.sleep_quality) : null;
  const sleepHours = Number.isFinite(Number(src.sleep_hours)) ? Number(src.sleep_hours) : null;
  const stressLevel = Number.isFinite(Number(src.stress_level)) ? Number(src.stress_level) : null;
  const hydration =
    src.hydration_level === "low" || src.hydration_level === "ok" || src.hydration_level === "great"
      ? src.hydration_level
      : null;
  const waterMl = Number.isFinite(Number(src.water_intake_ml)) ? Number(src.water_intake_ml) : null;
  return {
    mood,
    sleep_quality: sleepQuality && sleepQuality >= 1 && sleepQuality <= 5 ? sleepQuality : null,
    sleep_hours: sleepHours && sleepHours >= 0 && sleepHours <= 14 ? sleepHours : null,
    stress_level: stressLevel && stressLevel >= 1 && stressLevel <= 5 ? stressLevel : null,
    hydration_level: hydration,
    water_intake_ml: waterMl && waterMl >= 0 && waterMl <= 6000 ? waterMl : null,
    micro_habit_done: typeof src.micro_habit_done === "boolean" ? src.micro_habit_done : null,
  };
}

function buildMetaPayload(meta: DailyMeta): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (meta.mood) payload.mood = meta.mood;
  if (meta.sleep_quality != null) payload.sleep_quality = meta.sleep_quality;
  if (meta.sleep_hours != null) payload.sleep_hours = meta.sleep_hours;
  if (meta.stress_level != null) payload.stress_level = meta.stress_level;
  if (meta.hydration_level) payload.hydration_level = meta.hydration_level;
  if (meta.water_intake_ml != null) payload.water_intake_ml = meta.water_intake_ml;
  if (meta.micro_habit_done != null) payload.micro_habit_done = meta.micro_habit_done;
  return payload;
}

function localYYYYMMDD(d = new Date()) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, delta: number) {
  const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return localYYYYMMDD(dt);
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

function isToday(dateStr: string): boolean {
  return dateStr === localYYYYMMDD();
}

const TEMPLATES: Record<string, Entry[]> = {
  ...(DAILY_FLOW_TEMPLATES as Record<string, DailyFlowEntry[]>)
};

const TEMPLATE_META: Record<string, { ko: string; en: string; icon: string; descKo: string; descEn: string }> = {
  "Deep Work Day": { ko: "딥워크", en: "Deep Work", icon: "🔥", descKo: "집중 작업 위주", descEn: "Intensive focus sessions" },
  "Balanced Day": { ko: "밸런스", en: "Balanced", icon: "⚖️", descKo: "작업과 휴식의 균형", descEn: "Work & rest balanced" },
  "Light Day": { ko: "가벼운 하루", en: "Light Day", icon: "☁️", descKo: "가벼운 일정", descEn: "Light & easy schedule" }
};

const RECENT_META_KEY = "routineiq_recent_activities_v1";
const RECENT_LOCAL_FALLBACK_KEY = "routineiq_recent_activities_local_v1";

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function minutesToHHMM(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function nowRoundedHHMM(stepMinutes = 5): string {
  const d = new Date();
  const mins = d.getHours() * 60 + d.getMinutes();
  const rounded = Math.round(mins / stepMinutes) * stepMinutes;
  return minutesToHHMM(rounded);
}

/* ─── Main Component ─── */
export default function DailyFlowPage() {
  const locale = useLocale();
  const isKo = locale === "ko";
  const { mutate } = useSWRConfig();

  const t = React.useMemo(() => {
    if (isKo) {
      return {
        title: "Daily Flow",
        subtitle: "하루를 기록하고, AI가 분석합니다",
        today: "오늘",
        useYesterday: "어제 불러오기",
        addBlock: "블록 추가",
        save: "저장",
        saving: "저장 중...",
        saveAndAnalyze: "저장 & 분석",
        analyzeNow: "AI 분석",
        analyzing: "분석 중...",
        savedPrompt: "저장 완료! AI 분석을 시작할까요?",
        savedHint: "피크 타임, 집중력 패턴, 내일 스케줄을 받아보세요.",
        templates: "템플릿",
        emptyTitle: "오늘 하루를 기록해보세요",
        emptyDesc: "템플릿으로 빠르게 시작하거나, 직접 블록을 추가하세요",
        emptyManual: "직접 기록",
        loading: "불러오는 중...",
        activity: "활동명",
        energy: "에너지",
        focus: "집중도",
        low: "낮음",
        high: "높음",
        remove: "삭제",
        moreDetail: "메모 · 태그",
        note: "메모",
        tags: "태그",
        tagsPlaceholder: "딥워크, 미팅, 운동",
        dayNote: "오늘의 메모",
        dayNotePlaceholder: "오늘 하루 중 가장 중요했던 순간은?",
        quickSignalsTitle: "퀵 시그널 (선택)",
        quickSignalsDesc: "30초 입력 원칙: 기분/수면/수분만 체크해도 AI 정확도가 올라갑니다.",
        mood: "기분",
        sleepQuality: "수면 질",
        sleepHours: "수면 시간",
        stress: "스트레스",
        hydration: "수분 상태",
        waterIntake: "수분 섭취(ml)",
        microHabit: "오늘 5분 마이크로 습관 완료",
        mood_very_low: "매우 낮음",
        mood_low: "낮음",
        mood_neutral: "보통",
        mood_good: "좋음",
        mood_great: "매우 좋음",
        hydration_low: "부족",
        hydration_ok: "보통",
        hydration_great: "충분",
        now: "지금",
        invalidTime: (n: number) => `블록 #${n}: 시간 형식이 올바르지 않습니다`,
        endAfterStart: (n: number) => `블록 #${n}: 종료가 시작보다 빨라요`,
        overlap: (a: number, b: number) => `블록 #${a}과 #${b}의 시간이 겹칩니다`,
        failedLoad: "불러오기 실패",
        saveFailed: "저장 실패",
        analyzeFailed: "분석 실패",
        needSomethingToSave: "저장할 내용이 없습니다",
        newBlock: "새 블록",
        templateBlocks: (n: number) => `${n}개 블록`,
        suggest_activity: "활동 추천받기",
        reflect_on_day: "하루 회고하기",
        error_try_again: "오류가 발생했습니다"
      };
    }
    return {
      title: "Daily Flow",
      subtitle: "Record your day. AI will analyze it.",
      today: "Today",
      useYesterday: "Copy yesterday",
      addBlock: "Add block",
      save: "Save",
      saving: "Saving...",
      saveAndAnalyze: "Save & Analyze",
      analyzeNow: "AI Analyze",
      analyzing: "Analyzing...",
      savedPrompt: "Saved! Run AI analysis?",
      savedHint: "Get your peak hours, focus patterns, and tomorrow's plan.",
      templates: "Templates",
      emptyTitle: "Record your day",
      emptyDesc: "Pick a template to start quickly, or add blocks manually",
      emptyManual: "Add manually",
      loading: "Loading...",
      activity: "Activity",
      energy: "Energy",
      focus: "Focus",
      low: "Low",
      high: "High",
      remove: "Remove",
      moreDetail: "Notes & Tags",
      note: "Note",
      tags: "Tags",
      tagsPlaceholder: "deep work, meeting, workout",
      dayNote: "Day note",
      dayNotePlaceholder: "What was the highlight of your day?",
      quickSignalsTitle: "Quick Signals (Optional)",
      quickSignalsDesc: "30-second rule: mood/sleep/hydration gives the AI better context.",
      mood: "Mood",
      sleepQuality: "Sleep quality",
      sleepHours: "Sleep hours",
      stress: "Stress",
      hydration: "Hydration",
      waterIntake: "Water intake (ml)",
      microHabit: "I completed one 5-minute micro habit today",
      mood_very_low: "Very low",
      mood_low: "Low",
      mood_neutral: "Neutral",
      mood_good: "Good",
      mood_great: "Great",
      hydration_low: "Low",
      hydration_ok: "Okay",
      hydration_great: "Great",
      now: "Now",
      invalidTime: (n: number) => `Block #${n}: invalid time format`,
      endAfterStart: (n: number) => `Block #${n}: end must be after start`,
      overlap: (a: number, b: number) => `Block #${a} and #${b} overlap`,
      failedLoad: "Failed to load",
      saveFailed: "Save failed",
      analyzeFailed: "Analyze failed",
      needSomethingToSave: "Nothing to save yet",
      newBlock: "New block",
      templateBlocks: (n: number) => `${n} blocks`,
      suggest_activity: "Suggest Activity",
      reflect_on_day: "Reflect on Day",
      error_try_again: "Error, try again"
    };
  }, [isKo]);

  const router = useRouter();
  const [queryTemplate, setQueryTemplate] = React.useState<string | null>(null);
  const [queryQuickstart, setQueryQuickstart] = React.useState(false);
  const [date, setDate] = React.useState(() => localYYYYMMDD());
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [note, setNote] = React.useState<string>("");
  const [meta, setMeta] = React.useState<DailyMeta>({ ...EMPTY_META });
  const [recentActivities, setRecentActivities] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = React.useState<number | null>(null);
  const swipeStart = React.useRef<{ x: number; y: number } | null>(null);

  /* ─── SWR Data Fetching ─── */
  const { data: serverData, isLoading } = useSWR<{ date: string; entries: Entry[]; note: string | null; meta?: DailyMeta | null }>(
    `/logs?date=${date}`,
    apiFetch,
    {
      revalidateOnFocus: true,
      onSuccess: (data) => {
        if (data && !saving) { // Don't overwrite if currently saving
          setEntries(Array.isArray(data.entries) ? data.entries : []);
          setNote(data.note || "");
          setMeta(normalizeMeta(data.meta));
        }
      },
      onError: (err) => {
        const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
        setError(err instanceof Error ? `${err.message}${hint}` : t.failedLoad);
      }
    }
  );

  /* ─── Validation ─── */
  function validateEntries(list: Entry[]): string | null {
    for (const [idx, e] of list.entries()) {
      const s = toMinutes(e.start);
      const en = toMinutes(e.end);
      if (s == null || en == null) return t.invalidTime(idx + 1);
      if (en <= s) return t.endAfterStart(idx + 1);
    }
    const sorted = list
      .map((e, i) => ({ i, s: toMinutes(e.start) ?? 0, en: toMinutes(e.end) ?? 0 }))
      .sort((a, b) => a.s - b.s);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      if (cur.s < prev.en) return t.overlap(prev.i + 1, cur.i + 1);
    }
    return null;
  }

  /* ─── Data helpers ─── */
  async function loadRecent() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const meta = (user?.user_metadata as any) || {};
      const arr = meta[RECENT_META_KEY];
      if (Array.isArray(arr)) {
        setRecentActivities(arr.filter((x: unknown) => typeof x === "string").slice(0, 12));
        return;
      }
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(RECENT_LOCAL_FALLBACK_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) setRecentActivities(arr.filter((x) => typeof x === "string").slice(0, 12));
    } catch { /* ignore */ }
  }

  async function saveRecent(next: string[]) {
    setRecentActivities(next);
    try {
      const supabase = createClient();
      await supabase.auth.updateUser({ data: { [RECENT_META_KEY]: next.slice(0, 12) } });
    } catch {
      try { localStorage.setItem(RECENT_LOCAL_FALLBACK_KEY, JSON.stringify(next.slice(0, 12))); } catch { /* ignore */ }
    }
  }

  const useYesterday = React.useCallback(async () => {
    setSaving(true);
    try {
      const y = addDays(date, -1);
      const res = await apiFetch<{ entries: Entry[]; note: string | null; meta?: DailyMeta | null }>(`/logs?date=${y}`);
      if (res.entries) setEntries(res.entries);
      setNote(res.note || "");
      setMeta(normalizeMeta(res.meta));
    } catch (err) {
      setError(t.failedLoad);
    } finally {
      setSaving(false);
    }
  }, [date, t.failedLoad]);

  const applyTemplate = React.useCallback((name: string) => {
    const tmpl = TEMPLATES[name];
    if (!tmpl) return;
    setEntries(tmpl.map((e) => ({ ...e })));
  }, []);

  /* ─── Callbacks for EntryRow (Memoized) ─── */
  const addEntry = React.useCallback(() => {
    setEntries((prev) => {
      const last = prev[prev.length - 1];
      const start = last?.end && toMinutes(last.end) != null ? last.end : nowRoundedHHMM(5);
      const startM = toMinutes(start) ?? 9 * 60;
      const end = minutesToHHMM(Math.min(startM + 60, 23 * 60 + 59));
      return [...prev, { start, end, activity: t.newBlock, energy: null, focus: null, note: null, tags: [] }];
    });
  }, [t.newBlock]);

  const updateEntry = React.useCallback((idx: number, patch: Partial<Entry>) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }, []);

  const removeEntry = React.useCallback((idx: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
    setExpandedIdx((prev) => {
      if (prev === idx) return null;
      if (prev !== null && prev > idx) return prev - 1;
      return prev;
    });
  }, []);

  const setEntryRating = React.useCallback((idx: number, field: "energy" | "focus", value: number) => {
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i !== idx) return e;
        const current = (e as any)[field] as number | null | undefined;
        return { ...e, [field]: current === value ? null : value };
      })
    );
  }, []);

  const setEntryNow = React.useCallback((idx: number, field: "start" | "end") => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: nowRoundedHHMM(5) } : e)));
  }, []);

  const toggleExpand = React.useCallback((idx: number) => {
    setExpandedIdx((prev) => (prev === idx ? null : idx));
  }, []);

  /* ─── Navigation ─── */
  function navigateDate(delta: number) {
    const next = addDays(date, delta);
    setDate(next);
  }

  function goToday() {
    setDate(localYYYYMMDD());
  }

  /* ─── Save / Analyze ─── */
  async function save() {
    setError(null); setMessage(null);
    if (!entries.length && !note.trim()) { setError(t.needSomethingToSave); return; }
    const v = validateEntries(entries);
    if (v) { setError(v); return; }
    setSaving(true);

    // Optimistically update SWR cache
    const newData = { date, entries, note: note || null, meta: buildMetaPayload(meta) };
    await mutate(`/logs?date=${date}`, newData, false);

    try {
      await apiFetch(`/logs`, { method: "POST", body: JSON.stringify(newData) });
      setMessage(t.savedPrompt);
      const labels = entries.map((e) => e.activity.trim()).filter(Boolean);
      await saveRecent(Array.from(new Set([...labels.reverse(), ...recentActivities])).slice(0, 12));
      // Revalidate to be sure
      await mutate(`/logs?date=${date}`);
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setError(err instanceof Error ? `${err.message}${hint}` : t.saveFailed);
    } finally { setSaving(false); }
  }

  async function saveAndAnalyze() {
    setError(null); setMessage(null);
    if (!entries.length && !note.trim()) { setError(t.needSomethingToSave); return; }
    const v = validateEntries(entries);
    if (v) { setError(v); return; }
    setSaving(true);
    try {
      const newData = { date, entries, note: note || null, meta: buildMetaPayload(meta) };
      await apiFetch(`/logs`, { method: "POST", body: JSON.stringify(newData) });
      const labels = entries.map((e) => e.activity.trim()).filter(Boolean);
      await saveRecent(Array.from(new Set([...labels.reverse(), ...recentActivities])).slice(0, 12));
      await mutate(`/logs?date=${date}`);
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setError(err instanceof Error ? `${err.message}${hint}` : t.saveFailed);
      setSaving(false); return;
    }
    setSaving(false); setAnalyzing(true);
    try {
      await apiFetch(`/analyze`, { method: "POST", body: JSON.stringify({ date, force: true }) });
      router.push(`/app/reports/${date}`);
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setError(err instanceof Error ? `${err.message}${hint}` : t.analyzeFailed);
    } finally { setAnalyzing(false); }
  }

  /* ─── AI Features ─── */
  async function suggestActivity(idx: number) {
    if (analyzing) return;
    setAnalyzing(true);
    try {
      const current = entries[idx];
      const res = await apiFetch<{ activity: string; reason: string }>(`/suggest`, {
        method: "POST",
        body: JSON.stringify({
          current_time: current?.start || nowRoundedHHMM(5),
          context: note || null
        })
      });
      if (res && res.activity) {
        updateEntry(idx, { activity: res.activity });
        setNote((prev) => (prev ? `${prev}\nAI Thought: ${res.reason}` : `AI Thought: ${res.reason}`));
      }
    } catch (err) {
      setError(t.error_try_again);
    } finally {
      setAnalyzing(false);
    }
  }

  async function reflectOnDay() {
    if (analyzing) return;
    setAnalyzing(true);
    try {
      const res = await apiFetch<{ question: string }>(`/reflect`, {
        method: "POST",
        body: JSON.stringify({ date, entries, note })
      });
      if (res && res.question) {
        setNote((prev) => (prev ? `${prev}\n\nAI Reflection Question:\n${res.question}` : `AI Reflection Question:\n${res.question}`));
      }
    } catch (err) {
      setError(t.error_try_again);
    } finally {
      setAnalyzing(false);
    }
  }

  async function analyzeNow() {
    setError(null); setMessage(null); setAnalyzing(true);
    try {
      await apiFetch(`/analyze`, { method: "POST", body: JSON.stringify({ date, force: true }) });
      router.push(`/app/reports/${date}`);
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setError(err instanceof Error ? `${err.message}${hint}` : t.analyzeFailed);
    } finally { setAnalyzing(false); }
  }

  /* ─── Effects ─── */
  React.useEffect(() => { void loadRecent(); }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setQueryTemplate(params.get("template"));
    setQueryQuickstart(params.get("quickstart") === "1");
  }, []);

  // Sync templates/query params
  React.useEffect(() => {
    if (!queryTemplate || !queryQuickstart) return;
    applyTemplate(queryTemplate in TEMPLATES ? queryTemplate : DEFAULT_TEMPLATE_NAME);
    setNote(isKo ? "퀵스타트 템플릿" : "Quickstart template");
  }, [queryTemplate, queryQuickstart, isKo, applyTemplate]);

  /* ─── Render ─── */
  const hasAnything = entries.length > 0 || Boolean(note.trim());
  const isBusy = saving || analyzing;
  const moodOptions: Array<{ value: NonNullable<DailyMeta["mood"]>; emoji: string; label: string }> = [
    { value: "very_low", emoji: "😵", label: t.mood_very_low },
    { value: "low", emoji: "😕", label: t.mood_low },
    { value: "neutral", emoji: "😐", label: t.mood_neutral },
    { value: "good", emoji: "🙂", label: t.mood_good },
    { value: "great", emoji: "😄", label: t.mood_great },
  ];
  const hydrationOptions: Array<{ value: NonNullable<DailyMeta["hydration_level"]>; label: string }> = [
    { value: "low", label: t.hydration_low },
    { value: "ok", label: t.hydration_ok },
    { value: "great", label: t.hydration_great },
  ];

  return (
    <div
      className="mx-auto w-full max-w-3xl space-y-5 pb-32 md:pb-6"
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
      {/* ─── Header ─── */}
      <div className="space-y-4">
        <div>
          <h1 className="title-serif text-3xl">{t.title}</h1>
          <p className="mt-1 text-sm text-mutedFg">{t.subtitle}</p>
        </div>

        {/* Date Navigator */}
        <div className="flex items-center justify-between rounded-xl border bg-white/60 px-2 py-2 backdrop-blur">
          <Button variant="ghost" size="icon" onClick={() => navigateDate(-1)} aria-label="Previous day">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex flex-col items-center gap-0.5">
            <button className="text-lg font-semibold tracking-tight transition-colors hover:text-brand" onClick={goToday}>
              {formatDateLabel(date, isKo)}
            </button>
            {isToday(date) && (
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">{t.today}</span>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigateDate(1)} aria-label="Next day">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={useYesterday} disabled={isLoading} className="text-xs">
            <Copy className="mr-1 h-3.5 w-3.5" />
            {t.useYesterday}
          </Button>
          <div className="ml-auto hidden md:flex md:items-center md:gap-2">
            <Button variant="outline" size="sm" onClick={save} disabled={isBusy || !hasAnything}>
              <Save className="mr-1 h-3.5 w-3.5" />
              {saving ? t.saving : t.save}
            </Button>
            <Button size="sm" onClick={saveAndAnalyze} disabled={isBusy || !hasAnything}>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              {analyzing ? t.analyzing : t.saveAndAnalyze}
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Error ─── */}
      {error && (
        <div className="entry-animate whitespace-pre-line rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ─── Success / Analyze Prompt ─── */}
      {message && (
        <div className="entry-animate flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="font-medium">{message}</p>
            <p className="text-xs text-emerald-800/70">{t.savedHint}</p>
          </div>
          <Button size="sm" onClick={analyzeNow} disabled={analyzing} className="shrink-0">
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {analyzing ? t.analyzing : t.analyzeNow}
          </Button>
        </div>
      )}

      {/* ─── Timeline ─── */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <DailyEntrySkeleton />
            <DailyEntrySkeleton />
            <DailyEntrySkeleton />
          </div>
        ) : entries.length > 0 ? (
          <>
            {/* Template pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="shrink-0 text-xs font-medium text-mutedFg">{t.templates}:</span>
              {Object.keys(TEMPLATES).map((name) => {
                const meta = TEMPLATE_META[name];
                return (
                  <button
                    key={name}
                    onClick={() => applyTemplate(name)}
                    className="shrink-0 rounded-full border bg-white/60 px-3 py-1 text-xs text-mutedFg transition-colors hover:border-brand hover:text-brand"
                  >
                    {meta?.icon} {isKo ? meta?.ko ?? name : meta?.en ?? name}
                  </button>
                );
              })}
            </div>

            <datalist id="activity-suggestions">
              {recentActivities.map((a) => (<option key={a} value={a} />))}
            </datalist>

            {/* Entry Cards */}
            <div className="space-y-2">
              {entries.map((e, idx) => (
                <DailyEntryRow
                  key={idx}
                  entry={e}
                  idx={idx}
                  isExpanded={expandedIdx === idx}
                  analyzing={analyzing}
                  onUpdate={updateEntry}
                  onRemove={removeEntry}
                  onToggleExpand={toggleExpand}
                  onSuggest={suggestActivity}
                  onSetNow={setEntryNow}
                  onSetRating={setEntryRating}
                  t={t}
                />
              ))}
            </div>

            {/* Add block */}
            <button
              onClick={addEntry}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 py-3 text-sm text-mutedFg transition-colors hover:border-brand hover:text-brand"
            >
              <Plus className="h-4 w-4" /> {t.addBlock}
            </button>
          </>
        ) : (
          /* ─── Empty State ─── */
          <div className="space-y-4 py-4">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10">
                <NotebookPen className="h-8 w-8 text-brand" />
              </div>
              <h2 className="text-lg font-semibold">{t.emptyTitle}</h2>
              <p className="mt-1 text-sm text-mutedFg">{t.emptyDesc}</p>
            </div>

            {/* Template Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Object.entries(TEMPLATES).map(([name, blocks]) => {
                const meta = TEMPLATE_META[name];
                return (
                  <Card key={name} className="template-card border bg-white/70 backdrop-blur" onClick={() => applyTemplate(name)}>
                    <CardContent className="p-4">
                      <div className="mb-2 text-2xl">{meta?.icon ?? "📋"}</div>
                      <div className="text-sm font-semibold">{isKo ? meta?.ko ?? name : meta?.en ?? name}</div>
                      <div className="mt-0.5 text-xs text-mutedFg">{isKo ? meta?.descKo ?? "" : meta?.descEn ?? ""}</div>
                      <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-mutedFg">
                        <Clock className="h-3 w-3" />
                        {t.templateBlocks(blocks.length)}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <button
              onClick={addEntry}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 py-3 text-sm text-mutedFg transition-colors hover:border-brand hover:text-brand"
            >
              <Plus className="h-4 w-4" /> {t.emptyManual}
            </button>
          </div>
        )}

        {/* ─── Optional Daily Signals ─── */}
        {!isLoading && (
          <details className="group rounded-xl border bg-white/55 p-4 shadow-sm">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{t.quickSignalsTitle}</p>
                  <p className="mt-0.5 text-xs text-mutedFg">{t.quickSignalsDesc}</p>
                </div>
                <span className="rounded-full border bg-white/70 px-2 py-1 text-[10px] text-mutedFg group-open:hidden">
                  {isKo ? "열기" : "Open"}
                </span>
                <span className="hidden rounded-full border bg-white/70 px-2 py-1 text-[10px] text-mutedFg group-open:inline-flex">
                  {isKo ? "닫기" : "Close"}
                </span>
              </div>
            </summary>

            <div className="mt-4 space-y-4">
              <div>
                <Label className="text-xs text-mutedFg">{t.mood}</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {moodOptions.map((opt) => {
                    const active = meta.mood === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMeta((prev) => ({ ...prev, mood: prev.mood === opt.value ? null : opt.value }))}
                        className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          active ? "border-brand bg-brand/10 text-fg" : "bg-white/70 text-mutedFg hover:text-fg"
                        }`}
                      >
                        <span className="mr-1">{opt.emoji}</span>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs text-mutedFg">{t.sleepQuality}</Label>
                  <div className="mt-2 flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const active = meta.sleep_quality === n;
                      return (
                        <button
                          key={`sleep-${n}`}
                          type="button"
                          onClick={() => setMeta((prev) => ({ ...prev, sleep_quality: prev.sleep_quality === n ? null : n }))}
                          className={`h-8 w-8 rounded-md border text-xs transition-colors ${
                            active ? "border-brand bg-brand/10 text-fg" : "bg-white/70 text-mutedFg hover:text-fg"
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-mutedFg">{t.stress}</Label>
                  <div className="mt-2 flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const active = meta.stress_level === n;
                      return (
                        <button
                          key={`stress-${n}`}
                          type="button"
                          onClick={() => setMeta((prev) => ({ ...prev, stress_level: prev.stress_level === n ? null : n }))}
                          className={`h-8 w-8 rounded-md border text-xs transition-colors ${
                            active ? "border-brand bg-brand/10 text-fg" : "bg-white/70 text-mutedFg hover:text-fg"
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-mutedFg">{t.sleepHours}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={14}
                    step={0.5}
                    value={meta.sleep_hours ?? ""}
                    onChange={(e) => {
                      const next = e.target.value === "" ? null : Number(e.target.value);
                      setMeta((prev) => ({
                        ...prev,
                        sleep_hours: typeof next === "number" && Number.isFinite(next) ? next : null,
                      }));
                    }}
                    className="h-8 bg-white/70 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs text-mutedFg">{t.hydration}</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {hydrationOptions.map((opt) => {
                      const active = meta.hydration_level === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setMeta((prev) => ({
                              ...prev,
                              hydration_level: prev.hydration_level === opt.value ? null : opt.value,
                            }))
                          }
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                            active ? "border-brand bg-brand/10 text-fg" : "bg-white/70 text-mutedFg hover:text-fg"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-mutedFg">{t.waterIntake}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={6000}
                    step={50}
                    value={meta.water_intake_ml ?? ""}
                    onChange={(e) => {
                      const next = e.target.value === "" ? null : Number(e.target.value);
                      setMeta((prev) => ({
                        ...prev,
                        water_intake_ml: typeof next === "number" && Number.isFinite(next) ? next : null,
                      }));
                    }}
                    className="h-8 bg-white/70 text-sm"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-white/60 px-3 py-2 text-xs">
                <input
                  type="checkbox"
                  checked={meta.micro_habit_done === true}
                  onChange={(e) => setMeta((prev) => ({ ...prev, micro_habit_done: e.target.checked }))}
                  className="h-4 w-4 accent-brand"
                />
                <span>{t.microHabit}</span>
              </label>
            </div>
          </details>
        )}

        {/* ─── Day Note ─── */}
        {!isLoading && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-mutedFg">{t.dayNote}</Label>
              <button
                type="button"
                onClick={reflectOnDay}
                className="flex items-center gap-1 text-[10px] text-mutedFg hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={analyzing}
                title={t.reflect_on_day}
              >
                <Sparkles className={`h-3 w-3 ${analyzing ? "animate-pulse" : ""}`} />
                {analyzing ? (isKo ? "생성 중..." : "Generating...") : t.reflect_on_day}
              </button>
            </div>
            <Textarea
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={t.dayNotePlaceholder}
              className="min-h-[60px] resize-none bg-white/60"
            />
          </div>
        )}
      </div>

      {/* ─── Sticky Mobile Action Bar ─── */}
      <div className="sticky-actions md:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Button variant="outline" className="flex-1" onClick={save} disabled={isBusy || !hasAnything}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? t.saving : t.save}
          </Button>
          <Button className="flex-1" onClick={saveAndAnalyze} disabled={isBusy || !hasAnything}>
            <Sparkles className="mr-1.5 h-4 w-4" />
            {analyzing ? t.analyzing : t.saveAndAnalyze}
          </Button>
        </div>
      </div>
    </div>
  );
}
