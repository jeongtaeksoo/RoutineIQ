"use client";

import * as React from "react";

import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ReminderMeta = {
  enabled?: boolean;
  logTime?: string;
  planTime?: string;
};

export default function SettingsNotificationsPage() {
  const locale = useLocale();
  const isKo = locale === "ko";

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [enabled, setEnabled] = React.useState(false);
  const [logTime, setLogTime] = React.useState("21:30");
  const [planTime, setPlanTime] = React.useState("08:30");
  const [permission, setPermission] = React.useState<NotificationPermission | "unsupported">("unsupported");

  React.useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled || !user) return;
        const meta = (user.user_metadata?.routineiq_reminders_v1 || {}) as ReminderMeta;
        setEnabled(Boolean(meta.enabled));
        if (typeof meta.logTime === "string") setLogTime(meta.logTime);
        if (typeof meta.planTime === "string") setPlanTime(meta.planTime);
        if (typeof Notification === "undefined") setPermission("unsupported");
        else setPermission(Notification.permission);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        data: { routineiq_reminders_v1: { enabled, logTime, planTime } },
      });
      if (updateError) throw updateError;
      setMessage(isKo ? "저장되었습니다." : "Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : isKo ? "저장 실패" : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    const res = await Notification.requestPermission();
    setPermission(res);
  }

  const badgeVariant = permission === "granted" ? "default" : permission === "denied" ? "destructive" : "secondary";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isKo ? "알림 설정" : "Notification Settings"}</CardTitle>
        <CardDescription>
          {isKo
            ? "저녁 기록 리마인더와 아침 계획 리마인더를 제어합니다."
            : "Manage evening log reminders and morning plan reminders."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-mutedFg">{isKo ? "불러오는 중..." : "Loading..."}</p> : null}
        {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div> : null}
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

        <label className="flex items-center justify-between rounded-xl border bg-white/60 p-4 text-sm">
          <span>{isKo ? "리마인더 사용" : "Enable reminders"}</span>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 accent-brand" />
        </label>

        {enabled ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="text-mutedFg">{isKo ? "저녁 기록 시간" : "Evening log time"}</span>
              <input type="time" value={logTime} onChange={(e) => setLogTime(e.target.value)} className="h-10 w-full rounded-xl border bg-white/70 px-3" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-mutedFg">{isKo ? "아침 계획 시간" : "Morning plan time"}</span>
              <input type="time" value={planTime} onChange={(e) => setPlanTime(e.target.value)} className="h-10 w-full rounded-xl border bg-white/70 px-3" />
            </label>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={loading || saving}>
            {saving ? (isKo ? "저장 중..." : "Saving...") : isKo ? "저장" : "Save"}
          </Button>
          <Button variant="outline" onClick={requestPermission} disabled={permission === "granted" || permission === "unsupported"}>
            {isKo ? "브라우저 권한 요청" : "Request browser permission"}
          </Button>
          <Badge variant={badgeVariant as "default" | "secondary" | "destructive" | "outline"}>
            {permission}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
