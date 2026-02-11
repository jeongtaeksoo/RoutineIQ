import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border bg-white/60 p-6 shadow-soft">
        <h1 className="title-serif text-3xl">페이지를 찾을 수 없습니다</h1>
        <p className="mt-2 text-sm text-mutedFg">요청하신 페이지가 존재하지 않습니다.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-brandFg shadow-sm"
          >
            홈으로
          </Link>
          <Link
            href="/app/insights"
            className="inline-flex h-10 items-center justify-center rounded-md border bg-white/70 px-4 text-sm font-medium text-fg"
          >
            앱 열기
          </Link>
        </div>
      </div>
    </main>
  );
}
