"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, isApiFetchError } from "@/lib/api-client";
import { buildTomorrowRoutineIcs } from "@/lib/ics";

type AIReport = {
  summary: string;
  productivity_peaks: { start: string; end: string; reason: string }[];
  failure_patterns: { pattern: string; trigger: string; fix: string }[];
  tomorrow_routine: { start: string; end: string; activity: string; goal: string }[];
  if_then_rules: { if: string; then: string }[];
  coach_one_liner: string;
  yesterday_plan_vs_actual: { comparison_note: string; top_deviation: string };
};

const PREVIEW_REPORT_EN: AIReport = {
  summary: "Preview: your plan breaks when sessions have no buffers. Tomorrow we’ll protect power hours and add recovery rules.",
  productivity_peaks: [{ start: "09:30", end: "11:00", reason: "Low interruptions and high energy." }],
  failure_patterns: [
    { pattern: "Context switching", trigger: "Meetings without reset", fix: "Add a 10-min buffer: water + notes + pick next task." }
  ],
  tomorrow_routine: [
    { start: "09:30", end: "10:30", activity: "Deep work sprint", goal: "Ship one concrete output" },
    { start: "10:40", end: "11:10", activity: "Admin/messages", goal: "Clear the top 5 blockers" }
  ],
  if_then_rules: [{ if: "If you drift", then: "Then do 5-min reset + 25-min sprint (no inbox)." }],
  coach_one_liner: "Protect one real deep work block, and add buffers where you usually break.",
  yesterday_plan_vs_actual: { comparison_note: "Preview: run Analyze to see this comparison.", top_deviation: "Preview: interruptions and missing buffers." }
};

const PREVIEW_REPORT_KO: AIReport = {
  summary:
    "미리보기: 쉴 틈 없이 달리면 지치기 쉽습니다. 내일은 중간에 휴식을 꼭 챙기고, 나만의 속도를 찾아보세요.",
  productivity_peaks: [{ start: "09:30", end: "11:00", reason: "방해가 적고 에너지가 높은 시간대입니다." }],
  failure_patterns: [
    {
      pattern: "회의 후 흐트러짐",
      trigger: "쉼표 없이 이어지는 회의들",
      fix: "10분만 쉬어가세요: 물 한 잔 마시고, 생각을 정리한 뒤에 다음 일을 시작하세요."
    }
  ],
  tomorrow_routine: [
    { start: "09:30", end: "10:30", activity: "온전한 집중 시간", goal: "중요한 일 하나 끝내기" },
    { start: "10:40", end: "11:10", activity: "연락 확인하기", goal: "밀린 메시지 정리" }
  ],
  if_then_rules: [{ if: "자꾸 미루고 싶을 때", then: "5분만 책상을 정리하고, 딱 20분만 시작해봅니다." }],
  coach_one_liner: "하루에 하나, 온전히 집중하는 시간을 챙겨보세요.",
  yesterday_plan_vs_actual: { comparison_note: "미리보기: 리포트가 생성되면 계획과 실제를 비교해드립니다.", top_deviation: "미리보기: 방해 요소와 휴식 부족." }
};

// ... (addDays function remains same) ...

function addDays(dateStr: string, delta: number) {
  const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export default function ReportPage() {
  const router = useRouter();
  const params = useParams<{ date: string }>();
  const date = params.date;

  const locale = useLocale();
  const isKo = locale === "ko";
  const PREVIEW_REPORT = isKo ? PREVIEW_REPORT_KO : PREVIEW_REPORT_EN;
  const t = React.useMemo(() => {
    if (isKo) {
      return {
        title: "나의 하루 리포트",
        subtitle: "오늘 하루를 돌아보고, 내일은 조금 더 편안하게 흘러가도록 돕습니다.",
        date: "날짜",
        analyze: "이 날의 기록 정리하기",
        analyzing: "정리하는 중...",
        refresh: "다시 불러오기",
        loading: "잠시만요...",
        noReportTitle: "리포트를 만들 준비가 되었나요?",
        noReportDesc: "기록을 바탕으로 오늘의 흐름을 요약하고, 내일 챙겨야 할 것들을 정리해드립니다.",
        analyzeNow: "리포트 만들기",
        previewTitle: "리포트 예시",
        previewDesc: "분석이 완료되면 나만의 리포트가 만들어집니다.",
        coachOneLiner: "오늘의 한 마디",
        coachOneLinerDesc: "지금 바로 실행할 한 가지 행동입니다.",
        dayReview: "오늘의 요약",
        dayReviewDesc: "하루의 흐름과 코치의 조언.",
        comparisonNote: "비교 메모",
        topDeviation: "주요 원인",
        powerHours: "집중이 잘 된 시간",
        powerHoursDesc: "자연스럽게 몰입했던 순간들.",
        noPowerHours: "아직 데이터가 충분하지 않아요.",
        brokeFocus: "방해가 되었던 것들",
        brokeFocusDesc: "원인과 해결 제안.",
        trigger: "원인",
        fix: "제안",
        noFailure: "특별한 방해 요소가 없었습니다.",
        optimizedPlan: "내일을 위한 추천 흐름",
        optimizedPlanDesc: "무리가 되지 않도록 조정한 일정.",
        exportIcs: "캘린더로 내보내기 (.ics)",
        exporting: "내보내는 중...",
        noOptimizedPlan: "아직 추천 일정이 없습니다.",
        goal: "목표",
        recoveryRules: "나를 위한 팁",
        recoveryRulesDesc: "지치거나 힘들 때 꺼내보는 조언.",
        noRecovery: "아직 팁이 없습니다.",
        ifLabel: "이럴 땐",
        thenLabel: "이렇게 해보세요",
        failedLoad: "리포트를 불러오지 못했습니다",
        analyzeFailed: "분석에 실패했습니다",
        exportNoBlocks: "내보낼 일정이 없습니다",
        exportFailed: "캘린더 내보내기에 실패했습니다"
      };
    }
    return {
      title: "AI Coach Report",
      subtitle: "Date-based report. Find what broke and design a better tomorrow.",
      date: "Date",
      analyze: "Analyze this day",
      analyzing: "Analyzing...",
      refresh: "Reload report",
      loading: "Loading...",
      noReportTitle: "No report yet",
      noReportDesc: "Run Analyze to generate summary, triggers, tomorrow plan, and recovery rules.",
      analyzeNow: "Start analyze",
      previewTitle: "What you’ll get",
      previewDesc: "Sample preview (personalized after analyze).",
      coachOneLiner: "Coach Tip of the Day",
      coachOneLinerDesc: "One action you can do right now.",
      dayReview: "Your Day in Review",
      dayReviewDesc: "Summary + plan vs actual (when available).",
      comparisonNote: "Comparison Note",
      topDeviation: "Top Deviation",
      powerHours: "Your Power Hours",
      powerHoursDesc: "When you naturally perform best.",
      noPowerHours: "No power hours detected yet.",
      brokeFocus: "What Broke Your Focus",
      brokeFocusDesc: "Triggers + specific fixes.",
      trigger: "Trigger",
      fix: "Fix",
      noFailure: "No failure patterns detected yet.",
      optimizedPlan: "Your Optimized Day Plan",
      optimizedPlanDesc: "Tomorrow routine blocks.",
      exportIcs: "Export to Calendar (.ics)",
      exporting: "Exporting...",
      noOptimizedPlan: "No optimized plan generated yet.",
      goal: "Goal",
      recoveryRules: "Smart Recovery Rules",
      recoveryRulesDesc: "If-Then rules to recover fast.",
      noRecovery: "No recovery rules generated yet.",
      ifLabel: "IF",
      thenLabel: "THEN",
      failedLoad: "Failed to load report",
      analyzeFailed: "Analyze failed",
      exportNoBlocks: "No routine blocks to export",
      exportFailed: "Failed to export calendar"
    };
  }, [isKo]);

  const [loading, setLoading] = React.useState(true);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<AIReport | null>(null);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ date: string; report: AIReport }>(`/reports?date=${date}`);
      setReport(res.report);
    } catch (err) {
      const status = isApiFetchError(err) ? err.status : null;
      if (status === 404) {
        setReport(null);
      } else {
        const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
        setError(err instanceof Error ? `${err.message}${hint}` : t.failedLoad);
      }
    } finally {
      setLoading(false);
    }
  }

  async function analyze() {
    setError(null);
    setAnalyzing(true);
    try {
      const res = await apiFetch<{ date: string; report: AIReport }>(`/analyze`, {
        method: "POST",
        body: JSON.stringify({ date })
      });
      setReport(res.report);
    } catch (err) {
      const hint = isApiFetchError(err) && err.hint ? `\n${err.hint}` : "";
      setError(err instanceof Error ? `${err.message}${hint}` : t.analyzeFailed);
    } finally {
      setAnalyzing(false);
    }
  }

  async function exportCalendar() {
    setError(null);
    setExporting(true);
    try {
      if (!report?.tomorrow_routine?.length) throw new Error(t.exportNoBlocks);
      const routineForDate = addDays(date, 1);
      const ics = buildTomorrowRoutineIcs({ routineForDate, blocks: report.tomorrow_routine });
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `routineiq-${routineForDate}-routine.ics`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.exportFailed);
    } finally {
      setExporting(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="title-serif text-3xl">{t.title}</h1>
          <p className="mt-1 text-sm text-mutedFg">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-mutedFg">{t.date}</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => router.push(`/app/reports/${e.target.value}`)}
              className="w-[160px]"
            />
          </div>
          <Button onClick={analyze} disabled={analyzing}>
            <Sparkles className="h-4 w-4" />
            {analyzing ? t.analyzing : t.analyze}
          </Button>
          <Button variant="outline" onClick={load} disabled={loading}>
            {t.refresh}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="whitespace-pre-line rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-mutedFg">{t.loading}</p> : null}

      {!loading && !report ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.noReportTitle}</CardTitle>
            <CardDescription>{t.noReportDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={analyze} disabled={analyzing}>
              <Sparkles className="h-4 w-4" />
              {analyzing ? t.analyzing : t.analyzeNow}
            </Button>

            <div className="mt-5 space-y-3">
              <div className="rounded-xl border bg-white/50 p-4">
                <p className="text-sm font-semibold">{t.previewTitle}</p>
                <p className="mt-1 text-xs text-mutedFg">{t.previewDesc}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.dayReview}</p>
                  <p className="mt-2 text-sm">{PREVIEW_REPORT.coach_one_liner}</p>
                </div>
                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.optimizedPlan}</p>
                  <p className="mt-2 text-sm">
                    {PREVIEW_REPORT.tomorrow_routine[0]?.start}–{PREVIEW_REPORT.tomorrow_routine[0]?.end} ·{" "}
                    {PREVIEW_REPORT.tomorrow_routine[0]?.activity}
                  </p>
                  <p className="mt-1 text-xs text-mutedFg">
                    {t.goal}: {PREVIEW_REPORT.tomorrow_routine[0]?.goal}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!loading && report ? (
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-12">
            <CardHeader>
              <CardTitle>{t.coachOneLiner}</CardTitle>
              <CardDescription>{t.coachOneLinerDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="title-serif text-2xl leading-snug">{report.coach_one_liner}</p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-12">
            <CardHeader>
              <CardTitle>{t.dayReview}</CardTitle>
              <CardDescription>{t.dayReviewDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{report.summary}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.comparisonNote}</p>
                  <p className="mt-1 text-sm">{report.yesterday_plan_vs_actual.comparison_note}</p>
                </div>
                <div className="rounded-xl border bg-white/50 p-4">
                  <p className="text-xs text-mutedFg">{t.topDeviation}</p>
                  <p className="mt-1 text-sm">{report.yesterday_plan_vs_actual.top_deviation}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-6">
            <CardHeader>
              <CardTitle>{t.powerHours}</CardTitle>
              <CardDescription>{t.powerHoursDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.productivity_peaks.length ? (
                report.productivity_peaks.map((p, idx) => (
                  <div key={idx} className="rounded-xl border bg-white/50 p-4">
                    <p className="text-sm font-semibold">
                      {p.start}–{p.end}
                    </p>
                    <p className="mt-1 text-xs text-mutedFg">{p.reason}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-mutedFg">{t.noPowerHours}</p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-6">
            <CardHeader>
              <CardTitle>{t.brokeFocus}</CardTitle>
              <CardDescription>{t.brokeFocusDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.failure_patterns.length ? (
                report.failure_patterns.map((f, idx) => (
                  <div key={idx} className="rounded-xl border bg-white/50 p-4">
                    <p className="text-sm font-semibold">{f.pattern}</p>
                    <p className="mt-1 text-xs text-mutedFg">
                      {t.trigger}: {f.trigger}
                    </p>
                    <p className="mt-2 text-sm">
                      <span className="font-semibold">{t.fix}:</span> {f.fix}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-mutedFg">{t.noFailure}</p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-7">
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle>{t.optimizedPlan}</CardTitle>
                <CardDescription>{t.optimizedPlanDesc}</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={exportCalendar}
                disabled={exporting || !report.tomorrow_routine.length}
                title={isKo ? "Google/Apple 캘린더로 가져올 수 있는 .ics 파일로 내보냅니다" : "Export as .ics for Google Calendar / Apple Calendar"}
              >
                {exporting ? t.exporting : t.exportIcs}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.tomorrow_routine.length ? (
                report.tomorrow_routine.map((it, idx) => (
                  <div key={idx} className="rounded-xl border bg-white/50 p-4">
                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <p className="text-sm font-semibold">
                        {it.start}–{it.end} · {it.activity}
                      </p>
                      <span className="rounded-full border bg-white/70 px-2 py-1 text-[11px] text-mutedFg">
                        {t.goal}: {it.goal}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-mutedFg">{t.noOptimizedPlan}</p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle>{t.recoveryRules}</CardTitle>
              <CardDescription>{t.recoveryRulesDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.if_then_rules.length ? (
                report.if_then_rules.map((r, idx) => (
                  <div key={idx} className="rounded-xl border bg-white/50 p-4">
                    <p className="text-xs text-mutedFg">{t.ifLabel}</p>
                    <p className="text-sm font-semibold">{r.if}</p>
                    <p className="mt-2 text-xs text-mutedFg">{t.thenLabel}</p>
                    <p className="text-sm">{r.then}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-mutedFg">{t.noRecovery}</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
