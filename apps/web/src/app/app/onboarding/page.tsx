"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Circle, Sparkles } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trackProductEvent } from "@/lib/analytics";
import { useActivation } from "@/lib/use-activation";
import { cn } from "@/lib/utils";

type GuideSlide = {
  id: string;
  title: string;
  description: string;
  bullets: string[];
  ctaLabel: string;
  href: string;
  accentClass: string;
};

function getStepHref(nextStep: "profile" | "log" | "analyze" | "complete"): string {
  if (nextStep === "profile") return "/app/settings/profile";
  if (nextStep === "log") return "/app/log";
  if (nextStep === "analyze") return "/app/reports";
  return "/app/today";
}

export default function OnboardingPage() {
  const router = useRouter();
  const locale = useLocale();
  const isKo = locale === "ko";
  const { loading, activation } = useActivation();
  const completionTrackedRef = React.useRef(false);
  const touchStartX = React.useRef<number | null>(null);
  const [slideIndex, setSlideIndex] = React.useState(0);

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

  const stepHref = React.useMemo(() => getStepHref(activation.next_step), [activation.next_step]);
  const stepLabel = React.useMemo(() => {
    if (!isKo) {
      if (activation.next_step === "profile") return "Open profile";
      if (activation.next_step === "log") return "Start log";
      if (activation.next_step === "analyze") return "Create report";
      return "Go to Today";
    }
    if (activation.next_step === "profile") return "프로필 설정";
    if (activation.next_step === "log") return "기록 시작";
    if (activation.next_step === "analyze") return "리포트 만들기";
    return "나의 하루로 이동";
  }, [activation.next_step, isKo]);

  const slides = React.useMemo<GuideSlide[]>(() => {
    if (isKo) {
      return [
        {
          id: "log",
          title: "1. 오늘을 짧게 기록하세요",
          description: "완벽한 문장보다 빠른 입력이 중요해요. 3줄이면 충분합니다.",
          bullets: ["시간/활동/기분을 짧게", "실패 기록도 그대로", "30초 기록으로 시작"],
          ctaLabel: "기록하기",
          href: "/app/log",
          accentClass: "text-blue-700",
        },
        {
          id: "parse",
          title: "2. AI 정리 결과를 확인하세요",
          description: "겹치는 시간이나 빠진 블록을 바로 수정하면 분석 품질이 올라갑니다.",
          bullets: ["시간 겹침 체크", "활동명 한 번만 정리", "저장 전 1회 검토"],
          ctaLabel: "정리 화면 열기",
          href: "/app/log",
          accentClass: "text-violet-700",
        },
        {
          id: "report",
          title: "3. 리포트에서 원인과 복귀 포인트를 확인하세요",
          description: "좋은 날/무너진 날의 차이를 짧게 파악하면 내일 계획이 쉬워집니다.",
          bullets: ["오늘 요약 1줄", "방해 패턴 1개", "복귀 규칙 1개"],
          ctaLabel: "리포트 보기",
          href: "/app/reports",
          accentClass: "text-emerald-700",
        },
        {
          id: "plan",
          title: "4. 내일 계획은 첫 블록 1개만 실행하세요",
          description: "처음부터 많이 하지 말고, 내일 첫 60분만 지키는 걸 목표로 잡으세요.",
          bullets: ["첫 블록 시간 고정", "실행 포인트 1개", "실패 시 복귀 규칙 준비"],
          ctaLabel: "내일 계획 보기",
          href: "/app/plan",
          accentClass: "text-amber-700",
        },
      ];
    }
    return [
      {
        id: "log",
        title: "1. Log your day quickly",
        description: "Speed beats perfection. Three short lines are enough.",
        bullets: ["Time / activity / mood", "Keep failures in the log", "Start in 30 seconds"],
        ctaLabel: "Start log",
        href: "/app/log",
        accentClass: "text-blue-700",
      },
      {
        id: "parse",
        title: "2. Check AI-structured blocks",
        description: "Fix overlaps and missing windows once to improve analysis quality.",
        bullets: ["Check time overlaps", "Clarify activity labels", "Review once before save"],
        ctaLabel: "Open organize view",
        href: "/app/log",
        accentClass: "text-violet-700",
      },
      {
        id: "report",
        title: "3. Use report for root cause and recovery",
        description: "A short difference check between good and bad days makes tomorrow easier.",
        bullets: ["1-line summary", "One key blocker", "One recovery rule"],
        ctaLabel: "Open report",
        href: "/app/reports",
        accentClass: "text-emerald-700",
      },
      {
        id: "plan",
        title: "4. Execute only the first block tomorrow",
        description: "Don’t over-plan. Protect the first 60 minutes and build momentum.",
        bullets: ["Fix first-block time", "One action point", "Prepare one fallback rule"],
        ctaLabel: "Open tomorrow plan",
        href: "/app/plan",
        accentClass: "text-amber-700",
      },
    ];
  }, [isKo]);

  const totalSlides = slides.length;
  const onPrev = React.useCallback(() => {
    setSlideIndex((prev) => Math.max(0, prev - 1));
  }, []);
  const onNext = React.useCallback(() => {
    setSlideIndex((prev) => Math.min(totalSlides - 1, prev + 1));
  }, [totalSlides]);

  const onSlideNavigate = React.useCallback(
    (index: number) => {
      setSlideIndex(index);
      const slide = slides[index];
      if (!slide) return;
      trackProductEvent("onboarding_step_clicked", {
        source: "onboarding",
        meta: { step: `slide:${slide.id}` },
      });
    },
    [slides]
  );

  const steps = React.useMemo(
    () =>
      [
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
      ] as const,
    [activation.has_any_log, activation.has_any_report, activation.profile_complete, isKo]
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h1 className="title-serif text-3xl">{isKo ? "첫 사용 가이드" : "First-Use Guide"}</h1>
        <p className="mt-1 text-sm text-mutedFg">
          {isKo
            ? "처음 1분만 투자하면, 기록 → 분석 → 내일 실행 루프를 바로 시작할 수 있어요."
            : "Spend one minute to start the log → analyze → tomorrow execution loop."}
        </p>
      </div>

      <Card className="border-brand/30 bg-brand/5 shadow-elevated">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-brand" />
                {isKo ? "서비스 사용법 카드" : "How to Use Cards"}
              </CardTitle>
              <CardDescription>
                {isKo ? `카드 ${slideIndex + 1}/${totalSlides}` : `Card ${slideIndex + 1}/${totalSlides}`}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href={stepHref}>{isKo ? "건너뛰기" : "Skip"}</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="overflow-hidden"
            onTouchStart={(event) => {
              touchStartX.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const startX = touchStartX.current;
              touchStartX.current = null;
              if (startX == null) return;
              const endX = event.changedTouches[0]?.clientX ?? startX;
              const deltaX = endX - startX;
              if (deltaX <= -40) onNext();
              if (deltaX >= 40) onPrev();
            }}
          >
            <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${slideIndex * 100}%)` }}>
              {slides.map((slide) => {
                const targetHref = slide.href;
                return (
                  <article key={slide.id} className="w-full shrink-0">
                    <div className="rounded-xl border bg-white/80 p-4">
                      <p className={cn("text-sm font-semibold", slide.accentClass)}>{slide.title}</p>
                      <p className="mt-2 text-sm text-mutedFg">{slide.description}</p>
                      <ul className="mt-3 space-y-1.5 text-xs text-mutedFg">
                        {slide.bullets.map((bullet) => (
                          <li key={bullet} className="flex items-start gap-2">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4">
                        <Button asChild size="sm">
                          <Link
                            href={targetHref}
                            onClick={() =>
                              trackProductEvent("onboarding_step_clicked", {
                                source: "onboarding",
                                meta: { step: `cta:${slide.id}` },
                              })
                            }
                          >
                            {slide.ctaLabel}
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={`${index + 1}`}
                  onClick={() => onSlideNavigate(index)}
                  className={cn(
                    "h-2.5 rounded-full transition-all",
                    index === slideIndex ? "w-6 bg-brand" : "w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  )}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={onPrev} disabled={slideIndex === 0}>
                <ChevronLeft className="h-4 w-4" />
                {isKo ? "이전" : "Prev"}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (slideIndex < totalSlides - 1) {
                    onNext();
                    return;
                  }
                  trackProductEvent("onboarding_step_clicked", {
                    source: "onboarding",
                    meta: { step: "guide_done" },
                  });
                  router.push(stepHref);
                }}
              >
                {slideIndex < totalSlides - 1 ? (isKo ? "다음" : "Next") : isKo ? "바로 시작" : "Start now"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-brand/20 shadow-elevated">
        <CardHeader>
          <CardTitle>{isKo ? "활성화 진행률" : "Activation Progress"}</CardTitle>
          <CardDescription>
            {isKo ? `${progress}/3 단계 완료` : `${progress}/3 steps completed`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-2 w-full rounded-full bg-muted">
            <div className="h-2 rounded-full bg-brand transition-all" style={{ width: `${(progress / 3) * 100}%` }} />
          </div>
          <div className="flex items-center justify-between gap-2 rounded-xl border bg-white/70 p-3">
            <div>
              <p className="text-xs text-mutedFg">{isKo ? "다음 추천 단계" : "Next recommended step"}</p>
              <p className="mt-0.5 text-sm font-semibold">{stepLabel}</p>
            </div>
            <Button asChild size="sm">
              <Link href={stepHref}>
                {stepLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
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
