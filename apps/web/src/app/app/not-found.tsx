import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center justify-center px-5 py-10">
      <div className="w-full rounded-2xl border bg-white/70 p-6 shadow-soft">
        <h1 className="title-serif text-2xl">페이지를 찾을 수 없습니다</h1>
        <p className="mt-2 text-sm text-mutedFg">
          이동 경로가 변경되었거나 만료되었습니다. 아래 버튼으로 핵심 화면으로 이동하세요.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/app/today">오늘 화면</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/log">기록하기</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/app/reports">리포트</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
