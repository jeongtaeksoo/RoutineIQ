import { Suspense } from "react";

import LoginClient from "@/components/login-client";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-10">
          <div className="rounded-2xl border bg-white/60 p-5 shadow-soft">···</div>
        </main>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
