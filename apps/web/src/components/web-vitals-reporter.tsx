"use client";

import * as React from "react";
import { useReportWebVitals } from "next/web-vitals";

import { trackProductEvent } from "@/lib/analytics";

const WEB_VITALS_SAMPLE_KEY = "routineiq:web-vitals-sample:v1";
const WEB_VITALS_SAMPLE_RATE = 0.2;
const TRACKED_METRICS = new Set(["LCP", "INP", "CLS", "FCP", "TTFB"]);
type WebVitalsMetric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

function shouldSampleWebVitals(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const saved = window.sessionStorage.getItem(WEB_VITALS_SAMPLE_KEY);
    if (saved === "1") return true;
    if (saved === "0") return false;
    const sampled = Math.random() < WEB_VITALS_SAMPLE_RATE;
    window.sessionStorage.setItem(WEB_VITALS_SAMPLE_KEY, sampled ? "1" : "0");
    return sampled;
  } catch {
    return false;
  }
}

function metricValue(metric: WebVitalsMetric): number {
  if (typeof metric.value === "number" && Number.isFinite(metric.value)) {
    return Number(metric.value.toFixed(2));
  }
  return 0;
}

function metricDelta(metric: WebVitalsMetric): number {
  if (typeof metric.delta === "number" && Number.isFinite(metric.delta)) {
    return Number(metric.delta.toFixed(2));
  }
  return 0;
}

export function WebVitalsReporter() {
  const sampledRef = React.useRef<boolean>(shouldSampleWebVitals());
  const sentRef = React.useRef<Set<string>>(new Set());

  useReportWebVitals((metric) => {
    if (!sampledRef.current) return;
    if (!TRACKED_METRICS.has(metric.name)) return;
    if (sentRef.current.has(metric.id)) return;
    sentRef.current.add(metric.id);

    trackProductEvent("web_vitals_sampled", {
      source: "web",
      value: metricValue(metric),
      meta: {
        metric_name: metric.name,
        metric_id: metric.id,
        rating: metric.rating || null,
        delta: metricDelta(metric),
        navigation_type: metric.navigationType || null,
      },
    });
  });

  return null;
}
