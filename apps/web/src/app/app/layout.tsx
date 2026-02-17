import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { isE2ETestMode, isSupabaseConfigured } from "@/lib/supabase/env";
import type { Locale } from "@/lib/i18n";
import { normalizeLocale } from "@/lib/i18n";

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (isE2ETestMode()) {
    return (
      <AppShell role="user" email={null} initialLocale="ko">
        {children}
      </AppShell>
    );
  }

  if (!isSupabaseConfigured()) {
    redirect("/login?error=supabase_env");
  }

  const supabase = createClient();

  const {
    data: { session }
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user) {
    redirect("/login");
  }

  const meta = (user.user_metadata as any) || {};
  const loc = meta["routineiq_locale"];
  const initialLocale: Locale = loc ? normalizeLocale(loc) : "ko";

  return (
    <AppShell role="user" email={user.email || null} initialLocale={initialLocale}>
      {children}
    </AppShell>
  );
}
