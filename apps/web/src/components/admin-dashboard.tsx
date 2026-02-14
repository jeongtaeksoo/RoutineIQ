"use client";

import * as React from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type AdminUser = {
  id: string;
  email: string | null;
  role: string;
  created_at: string;
  plan: "free" | "pro";
  subscription_status: string | null;
  last_analyzed_date: string | null;
};

type AdminUserDetail = {
  profile: { id: string; email: string | null; role: string; created_at: string };
  plan: "free" | "pro";
  subscription: { stripe_subscription_id?: string; status?: string; plan?: string } | null;
  last_7d: { activity_logs_count: number; analyze_calls_count: number };
  latest_report: { date: string; created_at: string; model?: string; report?: any } | null;
};

type AdminError = {
  id: string;
  created_at: string;
  route: string;
  message: string;
  user_id: string | null;
};

export function AdminDashboard() {
  const locale = useLocale();
  const isKo = locale === "ko";
  const t = React.useMemo(() => {
    if (isKo) {
      return {
        title: "관리자",
        subtitle: "서버에서 관리자 권한을 재검증합니다. 서비스 롤 기반 쿼리 결과를 표시합니다.",
        refresh: "새로고침",
        loading: "불러오는 중...",
        users: "유저",
        usersDesc: "이메일, 플랜, 최근 분석일",
        joined: "가입",
        lastAnalyze: "최근 분석",
        visitor: "(방문 사용자)",
        noUsers: "유저가 없습니다.",
        userDetail: "유저 상세",
        userDetailDesc: "최근 7일 로그/사용량, 최신 리포트 미리보기",
        syncStripe: "Stripe 동기화",
        selectUser: "유저를 선택하세요.",
        loadingDetail: "상세 불러오는 중...",
        plan: "플랜",
        stripe: "Stripe",
        last7d: "최근 7일",
        logs: "로그",
        analyzeCalls: "분석 호출",
        latestReport: "최신 리포트",
        none: "없음",
        systemErrors: "시스템 에러 (최근 50개)",
        systemErrorsDesc: "최소 메타데이터만 저장합니다(민감정보 미저장).",
        loadAdminFailed: "관리자 데이터를 불러오지 못했습니다",
        loadDetailFailed: "유저 상세를 불러오지 못했습니다",
        syncFailed: "동기화에 실패했습니다"
      };
    }
    return {
      title: "Admin",
      subtitle: "Server-verified admin access. Data from service-role queries.",
      refresh: "Refresh",
      loading: "Loading...",
      users: "Users",
      usersDesc: "Email, plan, and last analyzed date.",
      joined: "Joined",
      lastAnalyze: "Last analyze",
      visitor: "(visitor)",
      noUsers: "No users.",
      userDetail: "User Detail",
      userDetailDesc: "Last 7 days activity + usage, and latest report preview.",
      syncStripe: "Sync Stripe",
      selectUser: "Select a user.",
      loadingDetail: "Loading detail...",
      plan: "Plan",
      stripe: "Stripe",
      last7d: "Last 7 days",
      logs: "Logs",
      analyzeCalls: "Analyze calls",
      latestReport: "Latest report",
      none: "None",
      systemErrors: "System Errors (Last 50)",
      systemErrorsDesc: "Minimal metadata only (no sensitive user content).",
      loadAdminFailed: "Failed to load admin data",
      loadDetailFailed: "Failed to load user detail",
      syncFailed: "Sync failed"
    };
  }, [isKo]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const [errors, setErrors] = React.useState<AdminError[]>([]);

  async function loadAll() {
    setError(null);
    setLoading(true);
    try {
      const [u, e] = await Promise.all([
        apiFetch<{ users: AdminUser[] }>(`/admin/users`),
        apiFetch<{ errors: AdminError[] }>(`/admin/errors`)
      ]);
      setUsers(u.users || []);
      setErrors(e.errors || []);
      if (!selectedId && u.users?.[0]?.id) setSelectedId(u.users[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadAdminFailed);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    setDetailLoading(true);
    try {
      const d = await apiFetch<AdminUserDetail>(`/admin/users/${id}`);
      setDetail(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadDetailFailed);
    } finally {
      setDetailLoading(false);
    }
  }

  async function syncSubscription() {
    if (!selectedId) return;
    setDetailLoading(true);
    try {
      await apiFetch(`/admin/sync-subscription/${selectedId}`, { method: "POST" });
      await Promise.all([loadAll(), loadDetail(selectedId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.syncFailed);
    } finally {
      setDetailLoading(false);
    }
  }

  React.useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!selectedId) return;
    void loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="title-serif text-3xl">{t.title}</h1>
          <p className="mt-1 text-sm text-mutedFg">{t.subtitle}</p>
        </div>
        <Button variant="outline" onClick={loadAll} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          {t.refresh}
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      ) : null}

      {loading ? <p className="text-sm text-mutedFg">{t.loading}</p> : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>{t.users}</CardTitle>
            <CardDescription>{t.usersDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {users.length ? (
              users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedId(u.id)}
                  className={cn(
                    "w-full rounded-xl border bg-white/50 p-3 text-left transition-colors hover:bg-white/70",
                    selectedId === u.id ? "ring-2 ring-ring/40" : ""
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{u.email || t.visitor}</div>
                      <div className="mt-1 text-xs text-mutedFg">
                        {t.joined}: {String(u.created_at).slice(0, 10)} · {t.lastAnalyze}: {u.last_analyzed_date || "-"}
                      </div>
                    </div>
                    <Badge variant={u.plan === "pro" ? "default" : "secondary"}>{u.plan.toUpperCase()}</Badge>
                  </div>
                </button>
              ))
            ) : (
              <p className="text-sm text-mutedFg">{t.noUsers}</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle>{t.userDetail}</CardTitle>
              <CardDescription>{t.userDetailDesc}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={syncSubscription} disabled={!selectedId || detailLoading}>
                {t.syncStripe}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedId ? <p className="text-sm text-mutedFg">{t.selectUser}</p> : null}
            {detailLoading ? <p className="text-sm text-mutedFg">{t.loadingDetail}</p> : null}
            {!detailLoading && detail ? (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border bg-white/50 p-4">
                    <p className="text-xs text-mutedFg">{t.plan}</p>
                    <p className="mt-1 text-lg font-semibold">{detail.plan.toUpperCase()}</p>
                    <p className="mt-1 text-xs text-mutedFg">
                      {t.stripe}: {detail.subscription?.status || "none"}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-white/50 p-4">
                    <p className="text-xs text-mutedFg">{t.last7d}</p>
                    <p className="mt-1 text-sm">
                      {t.logs}: {detail.last_7d.activity_logs_count}
                    </p>
                    <p className="mt-1 text-sm">
                      {t.analyzeCalls}: {detail.last_7d.analyze_calls_count}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.latestReport}</p>
                  {detail.latest_report ? (
                    <>
                      <p className="mt-1 text-sm font-semibold">
                        {detail.latest_report.date} ({detail.latest_report.model || "model"})
                      </p>
                      <p className="mt-2 text-sm text-mutedFg line-clamp-4">
                        {detail.latest_report.report?.summary || (isKo ? "(요약 없음)" : "(no summary)")}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-mutedFg">{t.none}</p>
                  )}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader>
            <CardTitle>{t.systemErrors}</CardTitle>
            <CardDescription>{t.systemErrorsDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {errors.length ? (
              errors.map((e) => (
                <div key={e.id} className="flex items-start gap-3 rounded-xl border bg-white/50 p-3">
                  <div className="mt-0.5 rounded-md border bg-white/70 p-1">
                    <ShieldAlert className="h-4 w-4 text-mutedFg" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{e.route}</p>
                      <p className="text-xs text-mutedFg">{String(e.created_at).replace("T", " ").slice(0, 19)}</p>
                    </div>
                    <p className="mt-1 text-sm text-mutedFg">{e.message}</p>
                    {e.user_id ? <p className="mt-1 text-xs text-mutedFg">user_id: {e.user_id}</p> : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-mutedFg">{isKo ? "에러 로그가 없습니다." : "No errors logged."}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
