import * as React from "react";
import { cn } from "@/lib/utils";

export type MoodValue = "very_low" | "low" | "neutral" | "good" | "great";

const MOODS: { value: MoodValue; emoji: string; label: string }[] = [
    { value: "very_low", emoji: "🤯", label: "최악" },
    { value: "low", emoji: "😞", label: "별로" },
    { value: "neutral", emoji: "😐", label: "보통" },
    { value: "good", emoji: "🙂", label: "좋음" },
    { value: "great", emoji: "🥰", label: "최고" },
];

interface MoodSelectorProps {
    value: MoodValue | null;
    onChange: (value: MoodValue) => void;
    disabled?: boolean;
}

export function MoodSelector({ value, onChange, disabled }: MoodSelectorProps) {
    return (
        <div className="flex w-full items-center justify-between gap-1 rounded-2xl border bg-white/40 p-2 backdrop-blur-sm md:gap-2">
            {MOODS.map((m) => {
                const selected = value === m.value;
                return (
                    <button
                        key={m.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(m.value)}
                        className={cn(
                            "group relative flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-3 transition-all duration-300",
                            selected
                                ? "bg-white shadow-soft scale-105"
                                : "hover:bg-white/50 hover:scale-105",
                            disabled && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <span
                            className={cn(
                                "text-2xl transition-transform duration-300 group-active:scale-95",
                                selected ? "scale-110" : "grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100"
                            )}
                        >
                            {m.emoji}
                        </span>
                        {selected && (
                            <span className="absolute -bottom-6 text-[10px] font-medium text-primary animate-in fade-in slide-in-from-top-1">
                                {m.label}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
