"use client";

import * as React from "react";
import { Flame } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { localYYYYMMDD } from "@/lib/date-utils";

export function StreakIndicator() {
    const [streak, setStreak] = React.useState<number | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        async function loadStreak() {
            try {
                const today = localYYYYMMDD();
                const start = new Date();
                start.setDate(start.getDate() - 6);
                const from = localYYYYMMDD(start);

                // We reuse the weekly endpoint as it contains streak info
                const res = await apiFetch<any>(`/insights/weekly?from=${from}&to=${today}`, {
                    timeoutMs: 10_000,
                });

                if (res.streak?.current !== undefined) {
                    setStreak(Number(res.streak.current));
                }
            } catch (e) {
                console.error("Failed to load streak", e);
            } finally {
                setLoading(false);
            }
        }

        loadStreak();
    }, []);

    if (loading || streak === null || streak === 0) return null;

    return (
        <div className="flex items-center gap-1 rounded-full bg-orange-100/50 px-2 py-1 text-orange-600 border border-orange-200/50" title="Current Streak">
            <Flame className="h-3.5 w-3.5 fill-orange-500 text-orange-600" />
            <span className="text-xs font-bold font-mono">{streak}</span>
        </div>
    );
}
