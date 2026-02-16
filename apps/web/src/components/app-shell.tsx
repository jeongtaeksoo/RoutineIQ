"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import {
  BarChart3,
  CreditCard,
  NotebookPen,
  Settings,
  Shield,
  Sparkles,
  LogOut
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LocaleProvider } from "@/components/locale-provider";
import { getStrings, type Locale, normalizeLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type NavItem = { key: "insights" | "daily_flow" | "reports" | "billing" | "preferences"; href: string; icon: React.ElementType };

const navItems: NavItem[] = [
  { key: "insights", href: "/app/insights", icon: BarChart3 },
  { key: "daily_flow", href: "/app/daily-flow", icon: NotebookPen },
  { key: "reports", href: "/app/reports", icon: Sparkles },
  { key: "billing", href: "/app/billing", icon: CreditCard },
  { key: "preferences", href: "/app/preferences", icon: Settings }
];

const ReminderScheduler = dynamic(
  () => import("@/components/reminder-scheduler").then((m) => m.ReminderScheduler),
  { ssr: false }
);

export function AppShell({
  children,
  email,
  role,
  initialLocale = "en"
}: {
  children: React.ReactNode;
  email: string | null;
  role: "user" | "admin";
  initialLocale?: Locale;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [locale, setLocale] = React.useState<Locale>(initialLocale);
  const [userMetaVersion, setUserMetaVersion] = React.useState(0);
  const [signingOut, setSigningOut] = React.useState(false);

  const supabaseRef = React.useRef<ReturnType<typeof createClient>>(undefined!);
  if (!supabaseRef.current) {
    supabaseRef.current = createClient();
  }
  const strings = React.useMemo(() => getStrings(locale), [locale]);

  const navLabels = React.useMemo(() => ({
    insights: strings.nav_insights,
    daily_flow: strings.nav_daily_flow,
    reports: strings.nav_reports,
    billing: strings.nav_billing,
    preferences: strings.nav_preferences,
  }), [strings]);

  const navShortLabels = React.useMemo(() => ({
    insights: strings.nav_short_insights,
    daily_flow: strings.nav_short_daily_flow,
    reports: strings.nav_short_reports,
    billing: strings.nav_short_billing,
    preferences: strings.nav_short_preferences,
  }), [strings]);

  async function signOut() {
    setSigningOut(true);
    try {
      await supabaseRef.current.auth.signOut();
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  }

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user }
        } = await supabaseRef.current.auth.getUser();
        if (!user) return;
        const meta = (user.user_metadata as any) || {};
        const loc = meta["routineiq_locale"];
        if (!cancelled) setLocale(loc ? normalizeLocale(loc) : "ko");
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const { data } = supabaseRef.current.auth.onAuthStateChange((event, session) => {
      if (event === "USER_UPDATED" || event === "SIGNED_IN") {
        const loc = (session?.user?.user_metadata as any)?.routineiq_locale;
        setLocale(loc ? normalizeLocale(loc) : "ko");
        setUserMetaVersion((v) => v + 1);
      }
      if (event === "SIGNED_OUT") {
        setUserMetaVersion((v) => v + 1);
      }
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <div
      className="min-h-screen md:flex"
      style={{ background: "linear-gradient(180deg, hsl(var(--bg)) 0%, hsl(var(--bg-soft)) 100%)" }}
    >
      <ReminderScheduler
        userMetaVersion={userMetaVersion}
        reminderLogTitle={strings.reminder_log_title}
        reminderLogBody={strings.reminder_log_body}
        reminderPlanTitle={strings.reminder_plan_title}
        reminderPlanBody={strings.reminder_plan_body}
      />
      <aside className="hidden w-72 shrink-0 p-5 md:flex">
        <div
          className="flex w-full flex-col gap-4 rounded-2xl border p-4 backdrop-blur"
          style={{ background: "hsl(var(--card) / 0.7)", boxShadow: "0 8px 32px -8px hsl(var(--fg) / 0.12)" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="title-serif text-xl leading-none">RutineIQ</div>
            </div>
            {role === "admin" ? (
              <span className="inline-flex items-center gap-1 rounded-full border bg-white/70 px-2 py-1 text-[11px] text-mutedFg">
                <Shield className="h-3.5 w-3.5" />
                {strings.nav_admin}
              </span>
            ) : null}
          </div>

          <nav className="flex flex-col gap-1">
            {navItems.map((it) => {
              const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
              const Icon = it.icon;
              const label = navLabels[it.key];
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200",
                    active
                      ? "bg-[hsl(var(--muted)/0.85)] text-fg shadow-sm font-medium"
                      : "text-mutedFg hover:bg-[hsl(var(--muted)/0.55)] hover:text-fg"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}

            {role === "admin" ? (
              <Link
                href="/admin"
                className={cn(
                  "mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200",
                  pathname === "/admin" || pathname.startsWith("/admin/")
                    ? "bg-[hsl(var(--muted)/0.85)] text-fg shadow-sm font-medium"
                    : "text-mutedFg hover:bg-[hsl(var(--muted)/0.55)] hover:text-fg"
                )}
              >
                <Shield className="h-4 w-4" />
                {strings.nav_admin}
              </Link>
            ) : null}
          </nav>

          <div className="mt-auto space-y-3">
            <div className="rounded-xl border bg-[hsl(var(--muted)/0.45)] p-3 text-xs text-mutedFg">
              {strings.signed_in_as}
              <div className="mt-1 truncate text-sm font-medium text-fg">{email || strings.visitor}</div>
            </div>
            <Button variant="outline" className="w-full justify-between" onClick={signOut} disabled={signingOut}>
              <span>{strings.sign_out}</span>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 px-5 py-6 pb-24 md:pb-6 fade-in">
          <LocaleProvider locale={locale}>{children}</LocaleProvider>
        </main>
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-20 border-t backdrop-blur md:hidden"
        style={{ background: "hsl(var(--bg) / 0.9)" }}
      >
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {navItems.map((it) => {
            const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
            const Icon = it.icon;
            const short = navShortLabels[it.key];
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[68px] flex-col items-center justify-center gap-1 px-2 pt-2 text-[11px] transition-colors",
                  active ? "text-fg" : "text-mutedFg"
                )}
                style={{ paddingBottom: "calc(0.55rem + env(safe-area-inset-bottom))" }}
              >
                <Icon className={cn("h-5 w-5", active ? "text-brand" : "text-mutedFg")} />
                <span className="line-clamp-1">{short}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
