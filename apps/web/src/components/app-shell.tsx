"use client";

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

  const strings = React.useMemo(() => getStrings(locale), [locale]);
  const reminderTimersRef = React.useRef<number[]>([]);
  const reminderCancelledRef = React.useRef(false);

  async function signOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  }

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
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
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
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

  React.useEffect(() => {
    function clearTimers() {
      for (const t of reminderTimersRef.current) window.clearTimeout(t);
      reminderTimersRef.current = [];
    }

    clearTimers();
    reminderCancelledRef.current = false;

    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    function scheduleDaily(opts: { kind: string; hhmm: string; title: string; body: string; href: string }) {
      const m = /^(\d{2}):(\d{2})$/.exec(opts.hhmm);
      if (!m) return;
      const hh = Number(m[1]);
      const mm = Number(m[2]);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return;
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return;

      const now = new Date();
      const target = new Date();
      target.setHours(hh, mm, 0, 0);
      if (target.getTime() <= now.getTime() + 1000) target.setDate(target.getDate() + 1);
      const delay = Math.max(0, target.getTime() - now.getTime());

      const id = window.setTimeout(() => {
        if (reminderCancelledRef.current) return;
        try {
          const n = new Notification(opts.title, { body: opts.body, tag: `routineiq-${opts.kind}` });
          n.onclick = () => {
            try {
              window.focus();
              window.location.href = opts.href;
            } finally {
              n.close();
            }
          };
        } catch {
          // ignore
        } finally {
          // Schedule next day (best-effort; works while tab is open).
          scheduleDaily(opts);
        }
      }, delay);
      reminderTimersRef.current.push(id);
    }

    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user) return;

        const meta = (user.user_metadata as any) || {};
        const r = meta["routineiq_reminders_v1"];
        if (!r || typeof r !== "object") return;
        if (!Boolean((r as any).enabled)) return;

        const logTime = typeof (r as any).logTime === "string" ? String((r as any).logTime) : "";
        const planTime = typeof (r as any).planTime === "string" ? String((r as any).planTime) : "";
        if (cancelled) return;

        scheduleDaily({
          kind: "log",
          hhmm: logTime || "21:30",
          title: strings.reminder_log_title,
          body: strings.reminder_log_body,
          href: "/app/daily-flow"
        });
        scheduleDaily({
          kind: "plan",
          hhmm: planTime || "08:30",
          title: strings.reminder_plan_title,
          body: strings.reminder_plan_body,
          href: "/app/insights"
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
      reminderCancelledRef.current = true;
      clearTimers();
    };
  }, [
    userMetaVersion,
    strings.reminder_log_body,
    strings.reminder_log_title,
    strings.reminder_plan_body,
    strings.reminder_plan_title
  ]);

  return (
    <div className="min-h-screen md:flex" style={{ background: "linear-gradient(180deg, hsl(35 30% 96%) 0%, hsl(33 25% 94%) 100%)" }}>
      <aside className="hidden w-72 shrink-0 p-5 md:flex">
        <div className="flex w-full flex-col gap-4 rounded-2xl border p-4 backdrop-blur" style={{ background: "rgba(255,252,248,0.65)", boxShadow: "0 8px 32px -8px rgba(74,63,53,0.08)" }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="title-serif text-xl leading-none">RoutineIQ</div>
              <div className="mt-1 text-xs text-mutedFg">{strings.appTagline}</div>
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
              const label =
                it.key === "insights"
                  ? strings.nav_insights
                  : it.key === "daily_flow"
                    ? strings.nav_daily_flow
                    : it.key === "reports"
                      ? strings.nav_reports
                      : it.key === "billing"
                        ? strings.nav_billing
                        : strings.nav_preferences;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                    active ? "bg-[#f5efe7] text-fg shadow-sm font-medium" : "text-mutedFg hover:bg-[#faf5ee] hover:text-fg"
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
                  "mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                  pathname === "/admin" || pathname.startsWith("/admin/")
                    ? "bg-[#f5efe7] text-fg shadow-sm font-medium"
                    : "text-mutedFg hover:bg-[#faf5ee] hover:text-fg"
                )}
              >
                <Shield className="h-4 w-4" />
                {strings.nav_admin}
              </Link>
            ) : null}
          </nav>

          <div className="mt-auto space-y-3">
            <div className="rounded-xl border bg-[#faf5ee]/70 p-3 text-xs text-mutedFg">
              {strings.signed_in_as}
              <div className="mt-1 truncate text-sm font-medium text-fg">{email || strings.guest}</div>
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

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t backdrop-blur md:hidden" style={{ background: "rgba(253,249,244,0.88)" }}>
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {navItems.map((it) => {
            const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
            const Icon = it.icon;
            const short =
              it.key === "insights"
                ? strings.nav_short_insights
                : it.key === "daily_flow"
                  ? strings.nav_short_daily_flow
                  : it.key === "reports"
                    ? strings.nav_short_reports
                    : it.key === "billing"
                      ? strings.nav_short_billing
                      : strings.nav_short_preferences;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  "flex flex-col items-center gap-1 px-2 py-3 text-[11px] transition-colors",
                  active ? "text-fg" : "text-mutedFg"
                )}
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
