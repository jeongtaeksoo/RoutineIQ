"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useLocale } from "@/components/locale-provider";
import { cn } from "@/lib/utils";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale();
  const isKo = locale === "ko";

  const tabs = [
    { href: "/app/settings/profile", label: isKo ? "개인 설정" : "Profile" },
    { href: "/app/settings/notifications", label: isKo ? "알림" : "Notifications" },
    { href: "/app/settings/privacy", label: isKo ? "데이터 제어" : "Privacy" },
    { href: "/app/settings/account", label: isKo ? "계정" : "Account" },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="title-serif text-3xl">{isKo ? "설정" : "Settings"}</h1>
        <p className="mt-1 text-sm text-mutedFg">
          {isKo
            ? "개인 설정, 알림, 데이터 제어, 계정 작업을 전용 페이지에서 안전하게 관리하세요."
            : "Manage profile, notifications, privacy controls, and account operations in dedicated pages."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-brand/50 bg-brand/10 text-fg"
                  : "bg-white/60 text-mutedFg hover:bg-white hover:text-fg"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
