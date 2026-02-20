"use client";

import * as React from "react";

import {
  EntitlementsSchema,
  type EntitlementsShape,
} from "@/lib/api/schemas";
import { apiFetchWithSchema } from "@/lib/api/validated-fetch";

const DEFAULT_ENTITLEMENTS: EntitlementsShape = {
  plan: "free",
  is_pro: false,
  status: null,
  current_period_end: null,
  cancel_at_period_end: null,
  needs_email_setup: false,
  can_use_checkout: true,
  analyze_used_today: 0,
  analyze_remaining_today: 0,
  limits: {
    daily_analyze_limit: 1,
    report_retention_days: 3,
  },
};

const ENTITLEMENTS_CACHE_TTL_MS = 60_000;
let entitlementsCache:
  | { ts: number; value: EntitlementsShape }
  | null = null;
let pendingEntitlementsPromise: Promise<EntitlementsShape> | null = null;

async function loadEntitlements(): Promise<EntitlementsShape> {
  const now = Date.now();
  if (entitlementsCache && now - entitlementsCache.ts < ENTITLEMENTS_CACHE_TTL_MS) {
    return entitlementsCache.value;
  }
  if (pendingEntitlementsPromise) {
    return pendingEntitlementsPromise;
  }

  pendingEntitlementsPromise = (async () => {
    try {
      const data = await apiFetchWithSchema(
        "/me/entitlements",
        EntitlementsSchema,
        { timeoutMs: 12_000 },
        "me entitlements"
      );
      entitlementsCache = { ts: Date.now(), value: data };
      return data;
    } catch {
      return DEFAULT_ENTITLEMENTS;
    } finally {
      pendingEntitlementsPromise = null;
    }
  })();
  return pendingEntitlementsPromise;
}

export function useEntitlements() {
  const [loading, setLoading] = React.useState(true);
  const [entitlements, setEntitlements] = React.useState<EntitlementsShape>(
    DEFAULT_ENTITLEMENTS
  );

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const data = await loadEntitlements();
        if (!cancelled) {
          setEntitlements(data);
        }
      } catch {
        if (!cancelled) {
          // Keep UX deterministic even if plan fetch fails.
          setEntitlements(DEFAULT_ENTITLEMENTS);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, entitlements };
}
