"use client";

import * as React from "react";

import { createClient } from "@/lib/supabase/client";

export function ReminderScheduler({
  userMetaVersion,
  reminderLogTitle,
  reminderLogBody,
  reminderPlanTitle,
  reminderPlanBody,
}: {
  userMetaVersion: number;
  reminderLogTitle: string;
  reminderLogBody: string;
  reminderPlanTitle: string;
  reminderPlanBody: string;
}) {
  const reminderTimersRef = React.useRef<number[]>([]);
  const reminderCancelledRef = React.useRef(false);

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
          title: reminderLogTitle,
          body: reminderLogBody,
          href: "/app/log"
        });
        scheduleDaily({
          kind: "plan",
          hhmm: planTime || "08:30",
          title: reminderPlanTitle,
          body: reminderPlanBody,
          href: "/app/today"
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
    reminderLogBody,
    reminderLogTitle,
    reminderPlanBody,
    reminderPlanTitle
  ]);

  return null;
}
