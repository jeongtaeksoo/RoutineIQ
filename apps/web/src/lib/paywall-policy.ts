"use client";

type PaywallSlot = "today" | "reports" | "plan";

type PaywallPolicyState = {
  day_key: string;
  week_key: string;
  daily_total: number;
  weekly_total: number;
  daily_by_slot: Partial<Record<PaywallSlot, number>>;
  weekly_by_slot: Partial<Record<PaywallSlot, number>>;
};

const PAYWALL_POLICY_KEY = "routineiq:paywall-policy:v1";
const DAILY_EXPOSURE_CAP = 3;
const WEEKLY_EXPOSURE_CAP = 12;

function localDayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localWeekKey(now: Date = new Date()): string {
  const date = new Date(now.getTime());
  date.setHours(0, 0, 0, 0);
  const day = date.getDay() || 7; // Monday-based week
  date.setDate(date.getDate() + 4 - day);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function createInitialState(now: Date = new Date()): PaywallPolicyState {
  return {
    day_key: localDayKey(now),
    week_key: localWeekKey(now),
    daily_total: 0,
    weekly_total: 0,
    daily_by_slot: {},
    weekly_by_slot: {},
  };
}

function readState(now: Date = new Date()): PaywallPolicyState {
  if (typeof window === "undefined") return createInitialState(now);
  try {
    const raw = window.localStorage.getItem(PAYWALL_POLICY_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<PaywallPolicyState>) : null;
    const base = createInitialState(now);
    if (!parsed || typeof parsed !== "object") return base;

    const dayKey = localDayKey(now);
    const weekKey = localWeekKey(now);
    const sameDay = parsed.day_key === dayKey;
    const sameWeek = parsed.week_key === weekKey;

    return {
      day_key: dayKey,
      week_key: weekKey,
      daily_total: sameDay ? Number(parsed.daily_total || 0) : 0,
      weekly_total: sameWeek ? Number(parsed.weekly_total || 0) : 0,
      daily_by_slot: sameDay && parsed.daily_by_slot ? parsed.daily_by_slot : {},
      weekly_by_slot: sameWeek && parsed.weekly_by_slot ? parsed.weekly_by_slot : {},
    };
  } catch {
    return createInitialState(now);
  }
}

function writeState(state: PaywallPolicyState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PAYWALL_POLICY_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures.
  }
}

export function canExposePaywallCta(slot: PaywallSlot): boolean {
  const state = readState();
  const dailySlotCount = Number(state.daily_by_slot[slot] || 0);
  if (state.daily_total >= DAILY_EXPOSURE_CAP) return false;
  if (state.weekly_total >= WEEKLY_EXPOSURE_CAP) return false;
  // Avoid repeating same slot too often in a single day.
  if (dailySlotCount >= 2) return false;
  return true;
}

export function recordPaywallCtaExposure(slot: PaywallSlot): void {
  const state = readState();
  const next: PaywallPolicyState = {
    ...state,
    daily_total: state.daily_total + 1,
    weekly_total: state.weekly_total + 1,
    daily_by_slot: {
      ...state.daily_by_slot,
      [slot]: Number(state.daily_by_slot[slot] || 0) + 1,
    },
    weekly_by_slot: {
      ...state.weekly_by_slot,
      [slot]: Number(state.weekly_by_slot[slot] || 0) + 1,
    },
  };
  writeState(next);
}
