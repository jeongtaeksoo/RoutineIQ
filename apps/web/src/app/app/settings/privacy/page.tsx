"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Database, ShieldAlert } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, isApiFetchError } from "@/lib/api-client";

export default function SettingsPrivacyPage() {
  const locale = useLocale();
  const isKo = locale === "ko";

  const [confirmText, setConfirmText] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const confirmKeyword = "DELETE";
  const canDelete = confirmText.trim().toUpperCase() === confirmKeyword;

  async function deleteMyData() {
    if (!canDelete || deleting) return;
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch<{ ok: boolean }>("/preferences/data", { method: "DELETE", timeoutMs: 20_000 });
      setConfirmText("");
      setMessage(isKo ? "모든 기록/리포트 데이터가 삭제되었습니다." : "All log/report data has been deleted.");
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setError(err instanceof Error ? `${err.message}${hint}` : isKo ? "데이터 삭제에 실패했습니다." : "Failed to delete data.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            {isKo ? "데이터 제어" : "Data Control"}
          </CardTitle>
          <CardDescription>
            {isKo
              ? "기록/리포트를 초기화하거나 개인정보 관련 작업을 수행합니다."
              : "Reset logs/reports and manage privacy-related actions."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border bg-[#faf5ee] p-4 text-sm text-[#5c554e]">
            <ul className="list-disc space-y-1 pl-4">
              <li>{isKo ? "삭제 시 기록/리포트 데이터는 복구할 수 없습니다." : "Deleted logs/reports cannot be recovered."}</li>
              <li>{isKo ? "계정 자체를 삭제하려면 계정 탭에서 진행하세요." : "Use Account settings for full account deletion."}</li>
              <li>{isKo ? "민감 작업은 2단계 확인을 요구합니다." : "Sensitive actions require a 2-step confirmation."}</li>
            </ul>
          </div>

          {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div> : null}
          {error ? <div className="whitespace-pre-line rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
        </CardContent>
      </Card>

      <Card className="border-red-200/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <ShieldAlert className="h-4 w-4" />
            {isKo ? "위험 작업" : "Danger Zone"}
          </CardTitle>
          <CardDescription>
            {isKo
              ? "기록/리포트 전체 삭제는 되돌릴 수 없습니다."
              : "Deleting all logs/reports is irreversible."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm text-red-900">
            <p className="font-semibold">{isKo ? "삭제 전 확인" : "Before deleting"}</p>
            <p className="mt-1">{isKo ? `아래 입력란에 ${confirmKeyword} 를 입력해야 삭제 버튼이 활성화됩니다.` : `Type ${confirmKeyword} to enable deletion.`}</p>
          </div>

          <label className="space-y-1.5 text-sm">
            <span className="text-mutedFg">{isKo ? "확인 문구 입력" : "Confirmation text"}</span>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={confirmKeyword}
              className="h-10 w-full rounded-xl border bg-white/70 px-3"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={deleteMyData}
              disabled={!canDelete || deleting}
              className="border-red-200 text-red-700 hover:bg-red-50"
            >
              <AlertTriangle className="h-4 w-4" />
              {deleting ? (isKo ? "삭제 중..." : "Deleting...") : isKo ? "기록/리포트 전체 삭제" : "Delete all logs/reports"}
            </Button>
            <Button asChild variant="ghost">
              <Link href="/app/settings/account">{isKo ? "계정 삭제로 이동" : "Go to account deletion"}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
