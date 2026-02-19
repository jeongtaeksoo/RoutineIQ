import * as React from "react";
import { cn } from "@/lib/utils";
import { toMinutes } from "@/lib/date-utils";

type TimelineEntry = {
    start: string | null;
    end: string | null;
    activity: string;
    crosses_midnight?: boolean;
    color?: string; // Optional override
};

interface TimelineViewProps {
    entries: TimelineEntry[];
    className?: string;
}

export function TimelineView({ entries, className }: TimelineViewProps) {
    // Normalize entries to minutes
    const blocks = React.useMemo(() => {
        return entries
            .map((e) => {
                if (!e.start || !e.end) return null;
                const startMin = toMinutes(e.start);
                const endMin = toMinutes(e.end);
                if (startMin == null || endMin == null) return null;

                // Handle midnight crossing visually if needed, for now clip to 24h or show full
                // If crosses midnight, we might just show it until 24:00 or handle wrap
                let duration = endMin - startMin;
                if (duration < 0) duration += 24 * 60; // Simple wrap handling

                return {
                    ...e,
                    startMin,
                    duration,
                };
            })
            .filter((e): e is NonNullable<typeof e> => e !== null);
    }, [entries]);

    if (blocks.length === 0) return null;

    // Find range to zoom in? Or just fixed 24h?
    // Fixed 06:00 to 02:00 (next day) is common, but let's do 0-24 for simplicity or adaptive.
    // Let's do a simple 24h vertical line.

    return (
        <div className={cn("relative flex h-[400px] w-full flex-col overflow-hidden rounded-2xl border bg-white/40 p-4 backdrop-blur-sm", className)}>
            <div className="absolute left-10 top-4 bottom-4 w-px bg-border/50" />

            <div className="relative h-full w-full overflow-y-auto pr-2 scrollbar-hide">
                {/* Hour markers */}
                {Array.from({ length: 25 }).map((_, i) => (
                    <div key={i} className="absolute left-0 w-full flex items-center text-[10px] text-muted-foreground/40" style={{ top: `${(i / 24) * 100}%` }}>
                        <span className="w-8 text-right pr-2">{i}:00</span>
                        <div className="flex-1 h-px bg-border/20" />
                    </div>
                ))}

                {/* Blocks */}
                {blocks.map((block, i) => {
                    const top = (block.startMin / (24 * 60)) * 100;
                    const height = (block.duration / (24 * 60)) * 100;

                    return (
                        <div
                            key={i}
                            className="absolute left-10 right-2 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-xs"
                            style={{
                                top: `${top}%`,
                                height: `${Math.max(height, 2)}%`, // Min height for visibility
                            }}
                        >
                            <div className="truncate font-medium text-primary-foreground/90">{block.activity}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
