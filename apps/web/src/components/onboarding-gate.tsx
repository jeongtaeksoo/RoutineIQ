"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { isE2ETestMode } from "@/lib/supabase/env";
import { useActivation } from "@/lib/use-activation";

const INCOMPLETE_ALLOW_PREFIXES = [
  "/app/onboarding",
  "/app/log",
  "/app/reports",
  "/app/settings",
] as const;

function isAllowedForIncomplete(pathname: string): boolean {
  return INCOMPLETE_ALLOW_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function OnboardingGate() {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, activation } = useActivation();

  React.useEffect(() => {
    if (isE2ETestMode()) return;
    if (!pathname.startsWith("/app")) return;
    if (loading) return;

    if (!activation.activation_complete && !isAllowedForIncomplete(pathname)) {
      router.replace("/app/onboarding");
      return;
    }

    if (activation.activation_complete && pathname === "/app/onboarding") {
      router.replace("/app/today");
    }
  }, [activation.activation_complete, loading, pathname, router]);

  return null;
}
