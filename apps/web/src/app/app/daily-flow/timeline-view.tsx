import * as React from "react";
import { cn } from "@/lib/utils";
import { toMinutes } from "@/lib/date-utils";

const TOTAL_DAY_MINUTES = 24 * 60;
const DEFAULT_WINDOW_START = 6 * 60;
const DEFAULT_WINDOW_END = 22 * 60;
const MIN_WINDOW_MINUTES = 6 * 60;
const WINDOW_MARGIN_MINUTES = 60;

type TimelineEntry = {
  start: string | null;
  end: string | null;
  activity: string;
  crosses_midnight?: boolean;
  color?: string;
};

interface TimelineViewProps {
  entries: TimelineEntry[];
  className?: string;
}

type TimelineBlock = TimelineEntry & {
  startMin: number;
  duration: number;
};

type PositionedBlock = TimelineBlock & {
  id: string;
  originalIndex: number;
  lane: number;
  laneCount: number;
  top: number;
  height: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatHour(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  return `${String(hour).padStart(2, "0")}:00`;
}

export function TimelineView({ entries, className }: TimelineViewProps) {
  const blocks = React.useMemo<TimelineBlock[]>(() => {
    return entries
      .map((entry) => {
        if (!entry.start || !entry.end) return null;
        const parsedStart = toMinutes(entry.start);
        const parsedEnd = toMinutes(entry.end);
        if (parsedStart == null || parsedEnd == null) return null;

        let duration = parsedEnd - parsedStart;
        if (duration <= 0) duration += TOTAL_DAY_MINUTES;

        const startMin = clamp(parsedStart, 0, TOTAL_DAY_MINUTES - 1);
        const clippedDuration = clamp(duration, 1, TOTAL_DAY_MINUTES - startMin);

        return {
          ...entry,
          startMin,
          duration: clippedDuration,
        };
      })
      .filter((block): block is TimelineBlock => block !== null);
  }, [entries]);

  const windowRange = React.useMemo(() => {
    if (blocks.length === 0) {
      return {
        start: DEFAULT_WINDOW_START,
        end: DEFAULT_WINDOW_END,
        total: DEFAULT_WINDOW_END - DEFAULT_WINDOW_START,
      };
    }

    const earliestStart = Math.min(...blocks.map((b) => b.startMin));
    const latestEnd = Math.max(...blocks.map((b) => b.startMin + b.duration));

    let start = clamp(earliestStart - WINDOW_MARGIN_MINUTES, 0, TOTAL_DAY_MINUTES);
    let end = clamp(latestEnd + WINDOW_MARGIN_MINUTES, 0, TOTAL_DAY_MINUTES);

    if (end - start < MIN_WINDOW_MINUTES) {
      const center = (start + end) / 2;
      start = clamp(center - MIN_WINDOW_MINUTES / 2, 0, TOTAL_DAY_MINUTES);
      end = clamp(start + MIN_WINDOW_MINUTES, 0, TOTAL_DAY_MINUTES);
      start = clamp(end - MIN_WINDOW_MINUTES, 0, TOTAL_DAY_MINUTES);
    }

    const roundedStart = Math.floor(start / 60) * 60;
    const roundedEnd = Math.ceil(end / 60) * 60;
    const normalizedStart = clamp(roundedStart, 0, TOTAL_DAY_MINUTES - 60);
    const normalizedEnd = clamp(roundedEnd, normalizedStart + 60, TOTAL_DAY_MINUTES);

    return {
      start: normalizedStart,
      end: normalizedEnd,
      total: normalizedEnd - normalizedStart,
    };
  }, [blocks]);

  const markers = React.useMemo(() => {
    const points: number[] = [];
    for (let minute = windowRange.start; minute <= windowRange.end; minute += 60) {
      points.push(minute);
    }
    return points;
  }, [windowRange.end, windowRange.start]);

  const positionedBlocks = React.useMemo<PositionedBlock[]>(() => {
    const intervals = blocks
      .map((block, index) => {
        const start = clamp(block.startMin, windowRange.start, windowRange.end - 1);
        const end = clamp(block.startMin + block.duration, start + 1, windowRange.end);
        return {
          ...block,
          id: `${block.start ?? "na"}-${block.end ?? "na"}-${index}`,
          intervalStart: start,
          intervalEnd: end,
          originalIndex: index,
        };
      })
      .sort((a, b) => a.intervalStart - b.intervalStart || a.intervalEnd - b.intervalEnd);

    type ClusterItem = (typeof intervals)[number] & { lane: number };
    const clusters: ClusterItem[][] = [];
    let currentCluster: ClusterItem[] = [];
    let currentClusterEnd = -1;

    intervals.forEach((interval) => {
      if (currentCluster.length === 0 || interval.intervalStart < currentClusterEnd) {
        currentCluster.push({ ...interval, lane: 0 });
        currentClusterEnd = Math.max(currentClusterEnd, interval.intervalEnd);
        return;
      }
      clusters.push(currentCluster);
      currentCluster = [{ ...interval, lane: 0 }];
      currentClusterEnd = interval.intervalEnd;
    });
    if (currentCluster.length > 0) clusters.push(currentCluster);

    const positioned: PositionedBlock[] = [];
    clusters.forEach((cluster) => {
      const laneEnds: number[] = [];
      cluster.forEach((item) => {
        let laneIndex = laneEnds.findIndex((end) => end <= item.intervalStart);
        if (laneIndex === -1) {
          laneIndex = laneEnds.length;
          laneEnds.push(item.intervalEnd);
        } else {
          laneEnds[laneIndex] = item.intervalEnd;
        }
        item.lane = laneIndex;
      });

      const laneCount = Math.max(laneEnds.length, 1);
      cluster.forEach((item) => {
        const top = ((item.intervalStart - windowRange.start) / windowRange.total) * 100;
        const height = ((item.intervalEnd - item.intervalStart) / windowRange.total) * 100;
        positioned.push({
          ...item,
          lane: item.lane,
          laneCount,
          top,
          height,
        });
      });
    });

    return positioned.sort((a, b) => a.originalIndex - b.originalIndex);
  }, [blocks, windowRange.end, windowRange.start, windowRange.total]);

  if (blocks.length === 0) return null;

  return (
    <div
      className={cn(
        "relative flex h-[320px] w-full flex-col overflow-hidden rounded-2xl border bg-white/70 p-3 backdrop-blur-sm md:h-[420px] md:p-4",
        className,
      )}
    >
      <div className="relative h-full w-full">
        <div className="pointer-events-none absolute bottom-0 left-14 top-0 w-px bg-border/60" />

        {markers.map((minute, index) => {
          const top = ((minute - windowRange.start) / windowRange.total) * 100;
          const major = index % 2 === 0;
          return (
            <div
              key={minute}
              className="pointer-events-none absolute left-0 right-0 flex items-center"
              style={{ top: `${top}%` }}
            >
              <span
                className={cn(
                  "w-12 pr-2 text-right tabular-nums",
                  major ? "text-[11px] font-medium text-muted-foreground/80" : "text-[10px] text-muted-foreground/45",
                )}
              >
                {major ? formatHour(minute) : ""}
              </span>
              <div className={cn("h-px flex-1", major ? "bg-border/40" : "bg-border/20")} />
            </div>
          );
        })}

        {positionedBlocks.map((block) => {
          const compact = block.height < 11 || block.laneCount >= 3;
          const laneWidth = 100 / block.laneCount;
          const laneLeft = laneWidth * block.lane;
          const laneGapPx = 6;

          return (
            <div
              key={block.id}
              className="absolute overflow-hidden rounded-lg border border-primary/25 bg-primary/10 px-2 py-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
              style={{
                top: `${block.top}%`,
                height: `${Math.max(block.height, 7)}%`,
                left: `calc(3.5rem + ${laneLeft}% + ${laneGapPx / 2}px)`,
                width: `calc(${laneWidth}% - ${laneGapPx}px)`,
              }}
            >
              <p className={cn("truncate leading-tight font-medium text-foreground", compact ? "text-[11px]" : "text-xs")}>{block.activity}</p>
              {!compact ? (
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {block.start} - {block.end}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
