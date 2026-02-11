import { Suspense } from "react";

import ResetPasswordClient from "@/components/reset-password-client";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-10">
          <div className="rounded-2xl border bg-white/60 p-5 shadow-soft">로딩 중…</div>
        </main>
      }
    >
      <ResetPasswordClient />
    </Suspense>
  );
}
