"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import {
  BarChart3,
  NotebookPen,
  Shield,
  Sparkles,
  LogOut
} from "lucide-react";

import { AppSettingsPanel } from "@/components/app-settings-panel";
import { Button } from "@/components/ui/button";
import { LocaleProvider } from "@/components/locale-provider";
import { getStrings, type Locale, normalizeLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type NavItem = { key: "insights" | "daily_flow" | "reports"; href: string; icon: React.ElementType };

const navItems: NavItem[] = [
  { key: "insights", href: "/app/insights", icon: BarChart3 },
  { key: "daily_flow", href: "/app/daily-flow", icon: NotebookPen },
  { key: "reports", href: "/app/reports", icon: Sparkles }
];

const ReminderScheduler = dynamic(
  () => import("@/components/reminder-scheduler").then((m) => m.ReminderScheduler),
  { ssr: false }
);

function sanitizeEmailDisplay(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.replace(/\s+/g, "").trim();
  return clean || null;
}

function maskEmail(value: string | null): string | null {
  if (!value) return null;
  const [local, domain] = value.split("@");
  if (!local || !domain) return value;
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

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
  const [resolvedRole, setResolvedRole] = React.useState<"user" | "admin">(role);
  const [resolvedEmail, setResolvedEmail] = React.useState<string | null>(sanitizeEmailDisplay(email));
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
  }), [strings]);

  const navShortLabels = React.useMemo(() => ({
    insights: strings.nav_short_insights,
    daily_flow: strings.nav_short_daily_flow,
    reports: strings.nav_short_reports,
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
        if (!cancelled) {
          setResolvedEmail(sanitizeEmailDisplay(user.email ?? null));
        }
        const meta = (user.user_metadata as any) || {};
        const loc = meta["routineiq_locale"];
        if (!cancelled) setLocale(loc ? normalizeLocale(loc) : "ko");

        const { data: profile } = await supabaseRef.current
          .from("profiles")
          .select("role,email")
          .eq("id", user.id)
          .maybeSingle();
        if (!cancelled) {
          setResolvedRole(profile?.role === "admin" ? "admin" : "user");
          if (profile?.email) setResolvedEmail(sanitizeEmailDisplay(profile.email));
        }
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
              {resolvedEmail ? <div className="mt-1 text-[11px] text-mutedFg">{maskEmail(resolvedEmail)}</div> : null}
            </div>
            <div className="flex items-center gap-2">
              {resolvedRole === "admin" ? (
                <span className="inline-flex items-center gap-1 rounded-full border bg-white/70 px-2 py-1 text-[11px] text-mutedFg">
                  <Shield className="h-3.5 w-3.5" />
                  {strings.nav_admin}
                </span>
              ) : null}
              <Button variant="ghost" size="icon" onClick={signOut} disabled={signingOut} aria-label={strings.sign_out}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
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

            {resolvedRole === "admin" ? (
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

          <div className="mt-auto" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 px-5 py-6 pb-bottom-safe md:pb-6 fade-in">
          <LocaleProvider locale={locale}>{children}</LocaleProvider>
        </main>
      </div>

      <React.Suspense fallback={null}>
        <AppSettingsPanel locale={locale} />
      </React.Suspense>

      <nav
        className="fixed bottom-0 left-0 right-0 z-20 border-t backdrop-blur md:hidden"
        style={{ background: "hsl(var(--bg) / 0.9)" }}
      >
        <div className="mx-auto grid max-w-2xl grid-cols-4">
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
                  "flex min-h-[68px] flex-col items-center justify-center gap-1 px-2 pt-2 text-[11px] transition-colors duration-200",
                  active ? "text-fg" : "text-mutedFg"
                )}
                style={{ paddingBottom: "calc(0.55rem + env(safe-area-inset-bottom))" }}
              >
                <span className={cn(
                  "flex items-center justify-center rounded-full p-1.5 transition-colors duration-200",
                  active ? "bg-brand/10 text-brand" : "text-mutedFg"
                )}>
                  <Icon className={cn("h-5 w-5", active ? "text-brand" : "text-mutedFg")} />
                </span>
                <span className="line-clamp-1">{short}</span>
                {active ? <span className="h-1 w-1 rounded-full bg-brand" /> : null}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="flex min-h-[68px] flex-col items-center justify-center gap-1 px-2 pt-2 text-[11px] text-mutedFg transition-colors duration-200 disabled:opacity-50"
            style={{ paddingBottom: "calc(0.55rem + env(safe-area-inset-bottom))" }}
          >
            <span className="flex items-center justify-center rounded-full p-1.5 transition-colors duration-200 text-mutedFg">
              <LogOut className="h-5 w-5 text-mutedFg" />
            </span>
            <span className="line-clamp-1">{strings.sign_out}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
