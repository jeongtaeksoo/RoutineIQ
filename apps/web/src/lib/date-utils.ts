/**
 * Shared date utility functions.
 * Extracted from daily-flow/page.tsx, insights/page.tsx, reports/[date]/page.tsx.
 */

export function localYYYYMMDD(d = new Date()): string {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export function addDays(dateStr: string, delta: number): string {
    const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    return localYYYYMMDD(dt);
}

export function toMinutes(hhmm: string | null | undefined): number | null {
    if (typeof hhmm !== "string") return null;
    const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
}
