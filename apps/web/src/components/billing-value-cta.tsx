"use client";

import Link from "next/link";
import { Crown } from "lucide-react";
import * as React from "react";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { trackProductEvent } from "@/lib/analytics";
import { canExposePaywallCta, recordPaywallCtaExposure } from "@/lib/paywall-policy";
import { useEntitlements } from "@/lib/use-entitlements";

type BillingValueCtaProps = {
  source: "today" | "reports" | "plan";
  className?: string;
};

export function BillingValueCta({ source, className }: BillingValueCtaProps) {
  const locale = useLocale();
  const isKo = locale === "ko";
  const { loading, entitlements } = useEntitlements();
  const [visible, setVisible] = React.useState(false);
  const exposureTrackedRef = React.useRef(false);

  React.useEffect(() => {
    if (loading || entitlements.is_pro) {
      setVisible(false);
      return;
    }
    if (!canExposePaywallCta(source)) {
      setVisible(false);
      return;
    }
    recordPaywallCtaExposure(source);
    setVisible(true);
    if (!exposureTrackedRef.current) {
      exposureTrackedRef.current = true;
      trackProductEvent("billing_cta_exposed", {
        source,
        meta: { entry: "value_cta" },
      });
    }
  }, [entitlements.is_pro, loading, source]);

  if (loading || entitlements.is_pro || !visible) return null;

  return (
    <Button asChild variant="outline" size="sm" className={className}>
      <Link
        href={`/app/billing?from=${encodeURIComponent(source)}`}
        onClick={() => {
          trackProductEvent("billing_cta_clicked", { source, meta: { entry: "value_cta" } });
        }}
      >
        <Crown className="h-4 w-4" />
        {isKo ? "PRO 가치 보기" : "Unlock Pro Value"}
      </Link>
    </Button>
  );
}
