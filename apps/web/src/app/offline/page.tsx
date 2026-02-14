export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border bg-white/60 p-6 shadow-soft">
        <h1 className="title-serif text-3xl">오프라인 상태입니다</h1>
        <p className="mt-2 text-sm text-mutedFg">
          RutineIQ는 로그 동기화 및 AI 리포트 생성을 위해 네트워크 연결이 필요합니다. 연결을 복구한 뒤 다시 시도해주세요.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href="/app/insights"
            className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-brandFg shadow-sm"
          >
            다시 시도
          </a>
          <a
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border bg-white/70 px-4 text-sm font-medium text-fg"
          >
            홈
          </a>
        </div>
      </div>
    </main>
  );
}
