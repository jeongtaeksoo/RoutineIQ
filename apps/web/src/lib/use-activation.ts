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

type LoadActivationOptions = {
  force?: boolean;
};

async function loadActivation(options?: LoadActivationOptions): Promise<ActivationShape> {
  const force = Boolean(options?.force);
  const now = Date.now();
  if (!force && activationCache && now - activationCache.ts < ACTIVATION_CACHE_TTL_MS) {
    return activationCache.value;
  }
  if (!force && pendingActivationPromise) return pendingActivationPromise;

  const requestPromise = (async () => {
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
      if (!force) pendingActivationPromise = null;
    }
  })();

  if (!force) pendingActivationPromise = requestPromise;
  return requestPromise;
}

export function useActivation() {
  const [loading, setLoading] = React.useState(true);
  const [activation, setActivation] =
    React.useState<ActivationShape>(DEFAULT_ACTIVATION);
  const mountedRef = React.useRef(true);

  const refresh = React.useCallback(
    async (options?: LoadActivationOptions): Promise<ActivationShape> => {
      const data = await loadActivation(options);
      if (mountedRef.current) {
        setActivation(data);
        setLoading(false);
      }
      return data;
    },
    []
  );

  React.useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    void refresh();

    const onFocus = () => {
      void refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return { loading, activation, refresh };
}
