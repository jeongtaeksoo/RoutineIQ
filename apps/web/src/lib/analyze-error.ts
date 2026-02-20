"use client";

import { isApiFetchError } from "@/lib/api-client";

export function isAnalyzeInProgressError(err: unknown): boolean {
  if (!isApiFetchError(err)) return false;
  if (err.code === "ANALYZE_IN_PROGRESS") return true;
  if (err.status !== 409) return false;
  return /already processing/i.test(err.message || "");
}

