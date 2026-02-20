"use client";

import Link from "next/link";
import * as React from "react";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trackProductEvent } from "@/lib/analytics";
import { useActivation } from "@/lib/use-activation";

export default function OnboardingPage() {
  const locale = useLocale();
  const isKo = locale === "ko";
  const { loading, activation } = useActivation();
  const completionTrackedRef = React.useRef(false);

  React.useEffect(() => {
    trackProductEvent("onboarding_viewed", { source: "onboarding" });
  }, []);

  React.useEffect(() => {
    if (!activation.activation_complete || completionTrackedRef.current) return;
    completionTrackedRef.current = true;
    trackProductEvent("onboarding_completed", { source: "onboarding" });
  }, [activation.activation_complete]);

  const progress = React.useMemo(() => {
    let done = 0;
    if (activation.profile_complete) done += 1;
    if (activation.has_any_log) done += 1;
    if (activation.has_any_report) done += 1;
    return done;
  }, [activation.has_any_log, activation.has_any_report, activation.profile_complete]);

  const steps = [
    {
      done: activation.profile_complete,
      title: isKo ? "프로필 필수값 입력" : "Complete profile essentials",
      desc: isKo ? "연령/직군/근무형태를 입력해 추천 품질을 높입니다." : "Set age/job/work mode to improve recommendations.",
      href: "/app/settings/profile",
      cta: isKo ? "프로필 설정" : "Open profile",
    },
    {
      done: activation.has_any_log,
      title: isKo ? "첫 기록 남기기" : "Create your first log",
      desc: isKo ? "오늘 흐름을 짧게 적어 AI 분석 입력을 만듭니다." : "Write a short day log to feed analysis.",
      href: "/app/log",
      cta: isKo ? "기록 시작" : "Start log",
    },
    {
      done: activation.has_any_report,
      title: isKo ? "첫 분석 완료" : "Finish first analysis",
      desc: isKo ? "리포트를 생성해 내일 계획 루프를 시작합니다." : "Generate a report and start tomorrow-plan loop.",
      href: "/app/reports",
      cta: isKo ? "리포트 열기" : "Open report",
    },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h1 className="title-serif text-3xl">{isKo ? "시작 설정" : "Activation Setup"}</h1>
        <p className="mt-1 text-sm text-mutedFg">
          {isKo
            ? "온보딩 3단계를 완료하면 개인화와 리포트 품질이 안정화됩니다."
            : "Complete 3 steps to stabilize personalization and report quality."}
        </p>
      </div>

      <Card className="border-brand/20 shadow-elevated">
        <CardHeader>
          <CardTitle>{isKo ? "진행률" : "Progress"}</CardTitle>
          <CardDescription>
            {isKo ? `${progress}/3 단계 완료` : `${progress}/3 steps completed`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-brand transition-all"
              style={{ width: `${(progress / 3) * 100}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {steps.map((step) => (
        <Card key={step.title}>
          <CardContent className="flex items-start justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 text-mutedFg" />
              )}
              <div>
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="mt-1 text-xs text-mutedFg">{step.desc}</p>
              </div>
            </div>
            {!step.done ? (
              <Button asChild size="sm">
                <Link
                  href={step.href}
                  onClick={() => {
                    trackProductEvent("onboarding_step_clicked", {
                      source: "onboarding",
                      meta: { step: step.href },
                    });
                  }}
                >
                  {step.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                {isKo ? "완료" : "Done"}
              </span>
            )}
          </CardContent>
        </Card>
      ))}

      {loading ? (
        <p className="text-sm text-mutedFg">{isKo ? "상태를 확인하는 중..." : "Checking activation status..."}</p>
      ) : activation.activation_complete ? (
        <Button asChild className="w-full sm:w-auto">
          <Link href="/app/today">
            {isKo ? "나의 하루 시작" : "Go to Today"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
