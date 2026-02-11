"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border bg-white/60 p-6 shadow-soft">
        <h1 className="title-serif text-3xl">문제가 발생했습니다</h1>
        <p className="mt-2 text-sm text-mutedFg">
          다시 시도해주세요. 문제가 반복된다면 백엔드 로그와 브라우저 콘솔을 확인하세요.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={reset}>다시 시도</Button>
          <Button variant="outline" onClick={() => (window.location.href = "/")}>
            홈
          </Button>
          <Button variant="secondary" onClick={() => (window.location.href = "/login")}>
            로그인
          </Button>
        </div>

        <div className="mt-5">
          <button
            type="button"
            className="text-xs text-mutedFg underline underline-offset-4 hover:text-fg"
            onClick={() => setDetailsOpen((v) => !v)}
          >
            {detailsOpen ? "에러 상세 숨기기" : "에러 상세 보기"}
          </button>
          {detailsOpen ? (
            <pre className="mt-3 overflow-auto rounded-lg border bg-white/50 p-3 text-[11px] text-mutedFg">
              {error?.message || "Unknown error"}
            </pre>
          ) : null}
        </div>
      </div>
    </main>
  );
}
