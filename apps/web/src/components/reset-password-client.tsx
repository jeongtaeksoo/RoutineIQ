"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordClient() {
  const router = useRouter();

  const [ready, setReady] = React.useState(false);
  const [hasSession, setHasSession] = React.useState(false);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const [password, setPassword] = React.useState("");
  const [password2, setPassword2] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!cancelled) setHasSession(Boolean(data.session));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Auth error");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      if (!password) throw new Error("비밀번호를 입력해주세요");
      if (password.length < 8) throw new Error("8자 이상으로 설정해주세요");
      if (password !== password2) throw new Error("비밀번호가 일치하지 않습니다");

      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage("비밀번호가 변경되었습니다. 이동 중…");
      router.replace("/app/today");
    } catch (err) {
      setError(err instanceof Error ? err.message : "비밀번호 변경에 실패했습니다");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="title-serif text-2xl">비밀번호 재설정</CardTitle>
          <CardDescription>계정의 새 비밀번호를 설정합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div>
          ) : null}

          {!ready ? <p className="text-sm text-mutedFg">세션 확인 중…</p> : null}

          {ready && !hasSession ? (
            <div className="rounded-xl border bg-white/50 p-4 text-sm text-mutedFg">
              복구 세션이 없습니다. 이메일의 비밀번호 재설정 링크를 다시 열어주세요.
            </div>
          ) : null}

          {ready && hasSession ? (
            <form className="space-y-4" onSubmit={updatePassword}>
              <div className="space-y-2">
                <Label htmlFor="pw">새 비밀번호</Label>
                <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">새 비밀번호 확인</Label>
                <Input id="pw2" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
              </div>
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "변경 중..." : "비밀번호 변경"}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
