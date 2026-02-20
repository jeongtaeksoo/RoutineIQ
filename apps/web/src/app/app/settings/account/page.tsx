"use client";

import * as React from "react";
import Link from "next/link";
import { CreditCard, ShieldCheck, Trash2 } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, isApiFetchError } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { useEntitlements } from "@/lib/use-entitlements";

export default function SettingsAccountPage() {
  const locale = useLocale();
  const isKo = locale === "ko";
  const { entitlements } = useEntitlements();

  const [loading, setLoading] = React.useState(true);
  const [deleting, setDeleting] = React.useState(false);
  const [name, setName] = React.useState("-");
  const [email, setEmail] = React.useState("-");
  const [confirmText, setConfirmText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        setName(user.user_metadata?.name ?? "-");
        setEmail(user.email ?? "-");

        const { data: profile } = await supabase
          .from("profiles")
          .select("name,email")
          .eq("id", user.id)
          .maybeSingle();

        if (!cancelled) {
          if (profile?.name) setName(profile.name);
          if (profile?.email) setEmail(profile.email);
        }

      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : isKo ? "계정 정보를 불러오지 못했습니다." : "Failed to load account info.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isKo]);

  const canDelete = confirmText.trim().toUpperCase() === "DELETE";

  async function deleteAccount() {
    if (!canDelete || deleting) return;
    setDeleting(true);
    setError(null);

    const supabase = createClient();
    try {
      await apiFetch<{ ok: boolean }>("/preferences/account", {
        method: "DELETE",
        timeoutMs: 120_000,
        retryOnTimeout: true,
      });
      await Promise.race([
        supabase.auth.signOut().catch(() => null),
        new Promise((resolve) => window.setTimeout(resolve, 1_500)),
      ]);
      window.location.assign("/login?deleted=1");
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setError(err instanceof Error ? `${err.message}${hint}` : isKo ? "계정 삭제에 실패했습니다." : "Failed to delete account.");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            {isKo ? "계정" : "Account"}
          </CardTitle>
          <CardDescription>
            {isKo
              ? "계정 정보 확인, 결제 관리, 계정 삭제를 수행합니다."
              : "View account details, manage billing, and delete account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <div className="whitespace-pre-line rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

          <div className="space-y-2 rounded-xl border bg-white/50 p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-mutedFg">{isKo ? "이름" : "Name"}</span>
              <span className="font-medium">{loading ? (isKo ? "불러오는 중..." : "Loading...") : name}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-mutedFg">{isKo ? "이메일" : "Email"}</span>
              <span className="font-medium">{loading ? (isKo ? "불러오는 중..." : "Loading...") : email}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-mutedFg">{isKo ? "현재 플랜" : "Current plan"}</span>
              <Badge variant={entitlements.is_pro ? "default" : "secondary"}>
                {entitlements.is_pro ? "PRO" : "FREE"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-mutedFg">{isKo ? "오늘 분석 사용" : "Analyze usage today"}</span>
              <span className="font-medium">
                {entitlements.analyze_used_today}/{entitlements.limits.daily_analyze_limit}
              </span>
            </div>
          </div>

          <Button asChild variant="outline">
            <Link href="/app/billing?from=settings">
              <CreditCard className="h-4 w-4" />
              {isKo ? "요금제/결제 관리" : "Manage plans & billing"}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-red-200/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <Trash2 className="h-4 w-4" />
            {isKo ? "회원탈퇴" : "Delete Account"}
          </CardTitle>
          <CardDescription>
            {isKo
              ? "계정 삭제 시 로그/리포트/프로필/구독 정보가 모두 삭제되며 복구할 수 없습니다."
              : "Deleting your account removes logs, reports, profile, and subscription records permanently."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm text-red-900">
            <p className="font-semibold">{isKo ? "2단계 확인" : "2-step confirmation"}</p>
            <p className="mt-1">{isKo ? "아래 입력란에 DELETE 를 입력해야 탈퇴 버튼이 활성화됩니다." : "Type DELETE to enable account deletion."}</p>
          </div>

          <label className="space-y-1.5 text-sm">
            <span className="text-mutedFg">{isKo ? "확인 문구 입력" : "Confirmation text"}</span>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="h-10 w-full rounded-xl border bg-white/70 px-3"
            />
          </label>

          <Button
            variant="outline"
            onClick={deleteAccount}
            disabled={!canDelete || deleting}
            className="border-red-200 text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? (isKo ? "삭제 중..." : "Deleting...") : isKo ? "회원탈퇴" : "Delete account"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
