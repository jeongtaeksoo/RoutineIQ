"use client";

import * as React from "react";

import { ActivationSchema, type ActivationShape } from "@/lib/api/schemas";
import { apiFetchWithSchema } from "@/lib/api/validated-fetch";

const DEFAULT_ACTIVATION: ActivationShape = {
  profile_complete: false,
  has_any_log: false,
  has_any_report: false,
  activation_complete: false,
  next_step: "profile",
};

const ACTIVATION_CACHE_TTL_MS = 30_000;
let activationCache: { ts: number; value: ActivationShape } | null = null;
let pendingActivationPromise: Promise<ActivationShape> | null = null;

async function loadActivation(): Promise<ActivationShape> {
  const now = Date.now();
  if (activationCache && now - activationCache.ts < ACTIVATION_CACHE_TTL_MS) {
    return activationCache.value;
  }
  if (pendingActivationPromise) return pendingActivationPromise;

  pendingActivationPromise = (async () => {
    try {
      const data = await apiFetchWithSchema(
        "/me/activation",
        ActivationSchema,
        { timeoutMs: 12_000 },
        "me activation"
      );
      activationCache = { ts: Date.now(), value: data };
      return data;
    } catch {
      return DEFAULT_ACTIVATION;
    } finally {
      pendingActivationPromise = null;
    }
  })();

  return pendingActivationPromise;
}

export function useActivation() {
  const [loading, setLoading] = React.useState(true);
  const [activation, setActivation] =
    React.useState<ActivationShape>(DEFAULT_ACTIVATION);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await loadActivation();
      if (!cancelled) {
        setActivation(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, activation };
}
