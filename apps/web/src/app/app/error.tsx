"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetail, setShowDetail] = React.useState(false);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center justify-center px-5 py-10">
      <div className="w-full rounded-2xl border bg-white/70 p-6 shadow-soft">
        <h1 className="title-serif text-2xl">문제가 발생했습니다</h1>
        <p className="mt-2 text-sm text-mutedFg">
          잠시 후 다시 시도하세요. 문제가 반복되면 로그아웃 후 다시 로그인해 주세요.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={reset}>다시 시도</Button>
          <Button asChild variant="outline">
            <Link href="/app/today">오늘 화면으로</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/login">로그인</Link>
          </Button>
        </div>

        <button
          type="button"
          className="mt-4 text-xs text-mutedFg underline underline-offset-4"
          onClick={() => setShowDetail((v) => !v)}
        >
          {showDetail ? "오류 상세 숨기기" : "오류 상세 보기"}
        </button>

        {showDetail ? (
          <pre className="mt-2 overflow-auto rounded-lg border bg-white/60 p-3 text-[11px] text-mutedFg">
            {error?.message || "Unknown error"}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
