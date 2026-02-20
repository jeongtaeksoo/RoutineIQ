import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

type TrustMetricTone = "neutral" | "good" | "warn";

type TrustMetric = {
  label: string;
  value: string;
  tone?: TrustMetricTone;
};

type TrustAction = {
  label: string;
  href: string;
};

const METRIC_TONE_STYLE: Record<TrustMetricTone, string> = {
  neutral: "border-blue-100 bg-white/70 text-blue-900",
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
};

export function TrustBadge({
  title,
  body,
  className,
  metrics = [],
  hint,
  actions = [],
}: {
  title: string;
  body: string;
  className?: string;
  metrics?: TrustMetric[];
  hint?: string;
  actions?: TrustAction[];
}) {
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3", className)}>
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-blue-900">{title}</p>
        <p className="mt-0.5 text-xs text-blue-800">{body}</p>

        {metrics.length ? (
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {metrics.map((metric) => {
              const tone = metric.tone ?? "neutral";
              return (
                <div
                  key={`${metric.label}:${metric.value}`}
                  className={cn("rounded-lg border px-2.5 py-2", METRIC_TONE_STYLE[tone])}
                >
                  <dt className="text-[11px] text-current/80">{metric.label}</dt>
                  <dd className="mt-0.5 text-xs font-semibold text-current">{metric.value}</dd>
                </div>
              );
            })}
          </dl>
        ) : null}

        {hint ? <p className="mt-2 text-[11px] text-blue-900/90">{hint}</p> : null}

        {actions.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="inline-flex items-center rounded-full border border-blue-200 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-blue-900 transition-colors hover:bg-white"
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
