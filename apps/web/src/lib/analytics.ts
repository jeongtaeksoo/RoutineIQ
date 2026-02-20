"use client";

import { apiFetch } from "@/lib/api-client";

type ProductEventName =
  | "ui_error_banner_shown"
  | "billing_page_viewed"
  | "billing_context_banner_viewed"
  | "billing_context_banner_cta_clicked"
  | "billing_cta_exposed"
  | "billing_cta_clicked"
  | "billing_checkout_started"
  | "billing_checkout_redirected"
  | "billing_checkout_failed"
  | "billing_email_convert_started"
  | "billing_email_convert_succeeded"
  | "billing_email_convert_failed"
  | "web_vitals_sampled"
  | "plan_roi_variant_viewed"
  | "plan_roi_cta_clicked"
  | "onboarding_viewed"
  | "onboarding_step_clicked"
  | "onboarding_completed"
  | "analyze_started"
  | "analyze_succeeded"
  | "analyze_canceled"
  | "analyze_failed";

type ProductEventPayload = {
  source?: string;
  date?: string;
  path?: string;
  value?: number;
  meta?: Record<string, unknown>;
};

function createEventRequestId(eventName: string): string {
  const globalCrypto =
    typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  const rand = globalCrypto?.randomUUID
    ? globalCrypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${eventName}:${rand}`.slice(0, 128);
}

export function trackProductEvent(
  eventName: ProductEventName,
  payload: ProductEventPayload = {}
): void {
  const eventPath =
    payload.path ||
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : undefined);
  const requestId = createEventRequestId(eventName);

  void apiFetch<{ ok: boolean }>("/analytics/events", {
    method: "POST",
    timeoutMs: 4_000,
    retryOnTimeout: false,
    body: JSON.stringify({
      event_name: eventName,
      source: payload.source,
      path: eventPath,
      value: payload.value,
      request_id: requestId,
      meta: payload.meta || {},
    }),
  }).catch(() => {
    // Analytics is best-effort and must not block user flows.
  });
}
