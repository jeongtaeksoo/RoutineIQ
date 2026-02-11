import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Locale } from "@/lib/i18n";
import { normalizeLocale } from "@/lib/i18n";

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) {
    redirect("/login?error=supabase_env");
  }

  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,email")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role === "admin" ? "admin" : "user";
  const email = profile?.email || user.email || null;

  const meta = (user.user_metadata as any) || {};
  const loc = meta["routineiq_locale"];
  const initialLocale: Locale = loc ? normalizeLocale(loc) : "ko";

  return (
    <AppShell role={role} email={email} initialLocale={initialLocale}>
      {children}
    </AppShell>
  );
}
