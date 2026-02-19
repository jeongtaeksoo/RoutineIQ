
"use client";

import { memo } from "react";
import { Sparkles, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { DailyFlowEntry } from "@/lib/daily-flow-templates";

export type DailyEntryRowProps = {
    entry: DailyFlowEntry;
    idx: number;
    isExpanded: boolean;
    analyzing: boolean;
    onUpdate: (idx: number, patch: Partial<DailyFlowEntry>) => void;
    onRemove: (idx: number) => void;
    onToggleExpand: (idx: number) => void;
    onSuggest: (idx: number) => void;
    onSetNow: (idx: number, field: "start" | "end") => void;
    onSetRating: (idx: number, field: "energy" | "focus", value: number) => void;
    t: {
        now: string;
        activity: string;
        suggest_activity: string;
        remove: string;
        energy: string;
        focus: string;
        low: string;
        high: string;
        moreDetail: string;
        note: string;
        tagsPlaceholder: string;
    };
};

function LevelBar({
    label,
    lowLabel,
    highLabel,
    value,
    onChange,
    colorClass
}: {
    label: string;
    lowLabel: string;
    highLabel: string;
    value: number | null | undefined;
    onChange: (v: number) => void;
    colorClass: string;
}) {
    return (
        <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[11px] font-medium text-mutedFg">{label}</span>
            <span className="text-[10px] text-mutedFg">{lowLabel}</span>
            <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => {
                    const filled = value != null && n <= value;
                    return (
                        <button
                            key={n}
                            type="button"
                            onClick={() => onChange(n)}
                            className={`h-5 w-5 rounded-full border-2 transition-[transform,background-color,border-color] duration-150 ${filled
                                ? `${colorClass} border-transparent scale-110`
                                : "border-gray-300 bg-transparent hover:border-gray-400 hover:scale-110"
                                }`}
                            aria-label={`${label} ${n}`}
                        />
                    );
                })}
            </div>
            <span className="text-[10px] text-mutedFg">{highLabel}</span>
        </div>
    );
}

function DailyEntryRowComponent({
    entry,
    idx,
    isExpanded,
    analyzing,
    onUpdate,
    onRemove,
    onToggleExpand,
    onSuggest,
    onSetNow,
    onSetRating,
    t
}: DailyEntryRowProps) {
    const avg = ((entry.energy ?? 3) + (entry.focus ?? 3)) / 2;
    let barColor = "bg-[#e08d79]"; // Muted Coral (Low)
    if (avg >= 4) barColor = "bg-[#8ab8a8]"; // Sage (High)
    else if (avg >= 3) barColor = "bg-[#e6c785]"; // Sand (Medium)

    return (
        <div className="entry-animate rounded-[1.25rem] border border-white/40 bg-white/60 shadow-sm backdrop-blur-md transition-all hover:shadow-soft hover:bg-white/80">
            <div className="flex gap-3 p-3.5">
                {/* Color bar */}
                <div className={`timeline-bar ${barColor} w-1.5 rounded-full shrink-0 opacity-80`} />

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-3">
                    {/* Row 1: Time + Activity + Delete */}
                    <div className="flex items-start gap-3">
                        <div className="flex shrink-0 flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                                <Input
                                    type="time"
                                    step={1800}
                                    value={entry.start}
                                    onChange={(ev) => onUpdate(idx, { start: ev.target.value })}
                                    className="h-8 w-[92px] rounded-lg border-black/5 bg-transparent px-2 text-xs font-medium focus:bg-white/50"
                                />
                                <span className="text-xs text-muted-foreground">–</span>
                                <Input
                                    type="time"
                                    step={1800}
                                    value={entry.end}
                                    onChange={(ev) => onUpdate(idx, { end: ev.target.value })}
                                    className="h-8 w-[92px] rounded-lg border-black/5 bg-transparent px-2 text-xs font-medium focus:bg-white/50"
                                />
                            </div>
                            <div className="flex gap-1.5">
                                <button
                                    className="rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                                    onClick={() => onSetNow(idx, "start")}
                                >
                                    {t.now} ↓
                                </button>
                                <button
                                    className="rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                                    onClick={() => onSetNow(idx, "end")}
                                >
                                    {t.now} ↓
                                </button>
                            </div>
                        </div>
                        <div className="relative min-w-0 flex-1">
                            <Input
                                value={entry.activity}
                                list="activity-suggestions"
                                onChange={(ev) => onUpdate(idx, { activity: ev.target.value })}
                                className="h-8 w-full rounded-lg border-black/5 bg-transparent px-3 text-sm font-medium focus:bg-white/50"
                                placeholder={t.activity}
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => onSuggest(idx)}
                                    disabled={analyzing}
                                    className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-brand/10 hover:text-brand disabled:opacity-30"
                                    title={t.suggest_activity}
                                >
                                    <Sparkles className={`h-3.5 w-3.5 ${analyzing ? "animate-pulse" : ""}`} />
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={() => onRemove(idx)}
                            className="shrink-0 rounded-full p-2 text-muted-foreground opacity-60 transition-all hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
                            aria-label={t.remove}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Row 2: Energy + Focus level bars */}
                    <div className="flex flex-col gap-2">
                        <LevelBar
                            label={t.energy}
                            lowLabel={t.low}
                            highLabel={t.high}
                            value={entry.energy}
                            onChange={(v) => onSetRating(idx, "energy", v)}
                            colorClass="bg-[#8ab8a8]" /* Sage */
                        />
                        <LevelBar
                            label={t.focus}
                            lowLabel={t.low}
                            highLabel={t.high}
                            value={entry.focus}
                            onChange={(v) => onSetRating(idx, "focus", v)}
                            colorClass="bg-[#7da0c4]" /* Soft Blue */
                        />
                    </div>

                    {/* Row 3: Expandable details */}
                    <button
                        onClick={() => onToggleExpand(idx)}
                        className="text-[11px] text-mutedFg hover:text-fg"
                    >
                        {isExpanded ? "▲" : "▼"} {t.moreDetail}
                    </button>
                    {isExpanded && (
                        <div className="entry-animate space-y-2 border-t pt-2">
                            <Input
                                value={entry.note ?? ""}
                                onChange={(ev) => onUpdate(idx, { note: ev.target.value })}
                                placeholder={t.note}
                                className="h-7 text-xs"
                            />
                            <Input
                                value={Array.isArray(entry.tags) ? entry.tags.join(", ") : ""}
                                onChange={(ev) =>
                                    onUpdate(idx, {
                                        tags: ev.target.value
                                            .split(",")
                                            .map((s) => s.trim())
                                            .filter(Boolean)
                                            .slice(0, 12)
                                    })
                                }
                                placeholder={t.tagsPlaceholder}
                                className="h-7 text-xs"
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export const DailyEntryRow = memo(DailyEntryRowComponent);

export function DailyEntrySkeleton() {
    return (
        <div className="rounded-xl border bg-white/40 p-3 shadow-sm">
            <div className="flex gap-3">
                <Skeleton className="h-full w-1 rounded-full" />
                <div className="flex-1 space-y-3">
                    <div className="flex gap-2">
                        <Skeleton className="h-7 w-20" />
                        <Skeleton className="h-7 w-20" />
                        <Skeleton className="h-7 flex-1" />
                        <Skeleton className="h-7 w-7" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-4 w-1/2" />
                    </div>
                </div>
            </div>
        </div>
    );
}
