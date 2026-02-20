"use client";

import * as React from "react";

import { ProfilePreferencesSchema, type ProfilePreferencesShape } from "@/lib/api/schemas";
import { apiFetchWithSchema } from "@/lib/api/validated-fetch";
import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ProfilePreferences = ProfilePreferencesShape;

const DEFAULT_PROFILE: ProfilePreferences = {
  age_group: "unknown",
  gender: "unknown",
  job_family: "unknown",
  work_mode: "unknown",
  trend_opt_in: true,
  trend_compare_by: ["age_group", "job_family", "work_mode"],
  goal_keyword: null,
  goal_minutes_per_day: 90,
};

export default function SettingsProfilePage() {
  const locale = useLocale();
  const isKo = locale === "ko";

  const [profile, setProfile] = React.useState<ProfilePreferences>(DEFAULT_PROFILE);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetchWithSchema(
          "/preferences/profile",
          ProfilePreferencesSchema,
          { timeoutMs: 12_000 },
          "profile preferences"
        );
        if (!cancelled) setProfile({ ...DEFAULT_PROFILE, ...res });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (
        profile.age_group === "unknown" ||
        profile.gender === "unknown" ||
        profile.job_family === "unknown" ||
        profile.work_mode === "unknown"
      ) {
        throw new Error(isKo ? "필수 항목을 선택하세요." : "Select all required fields.");
      }
      const payload = {
        ...profile,
        trend_opt_in: true,
        trend_compare_by: ["age_group", "job_family", "work_mode"] as const,
      };
      const saved = await apiFetchWithSchema(
        "/preferences/profile",
        ProfilePreferencesSchema,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
        "saved profile preferences"
      );
      setProfile({ ...DEFAULT_PROFILE, ...saved });
      setMessage(isKo ? "프로필을 저장했습니다." : "Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : isKo ? "저장 실패" : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const Option = ({ children, value }: { children: string; value: string }) => (
    <option value={value}>{children}</option>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isKo ? "개인 설정" : "Profile"}</CardTitle>
        <CardDescription>
          {isKo
            ? "추천 정확도와 유사 사용자 비교 품질을 높이기 위한 필수 정보입니다."
            : "Required information to improve recommendation quality and similar-user comparisons."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-mutedFg">{isKo ? "불러오는 중..." : "Loading..."}</p> : null}
        {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div> : null}
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="text-mutedFg">{isKo ? "연령대" : "Age group"}</span>
            <select
              value={profile.age_group}
              onChange={(e) => setProfile((prev) => ({ ...prev, age_group: e.target.value as ProfilePreferences["age_group"] }))}
              className="h-10 w-full rounded-xl border bg-white/70 px-3"
            >
              <Option value="unknown">{isKo ? "선택하세요" : "Select one"}</Option>
              <Option value="18_24">18-24</Option>
              <Option value="25_34">25-34</Option>
              <Option value="35_44">35-44</Option>
              <Option value="45_plus">45+</Option>
              <Option value="0_17">0-17</Option>
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="text-mutedFg">{isKo ? "성별" : "Gender"}</span>
            <select
              value={profile.gender}
              onChange={(e) => setProfile((prev) => ({ ...prev, gender: e.target.value as ProfilePreferences["gender"] }))}
              className="h-10 w-full rounded-xl border bg-white/70 px-3"
            >
              <Option value="unknown">{isKo ? "선택하세요" : "Select one"}</Option>
              <Option value="female">{isKo ? "여성" : "Female"}</Option>
              <Option value="male">{isKo ? "남성" : "Male"}</Option>
              <Option value="nonbinary">{isKo ? "논바이너리" : "Non-binary"}</Option>
              <Option value="prefer_not_to_say">{isKo ? "응답 안함" : "Prefer not to say"}</Option>
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="text-mutedFg">{isKo ? "직군" : "Job family"}</span>
            <select
              value={profile.job_family}
              onChange={(e) => setProfile((prev) => ({ ...prev, job_family: e.target.value as ProfilePreferences["job_family"] }))}
              className="h-10 w-full rounded-xl border bg-white/70 px-3"
            >
              <Option value="unknown">{isKo ? "선택하세요" : "Select one"}</Option>
              <Option value="office_worker">{isKo ? "회사원/사무직" : "Office Worker"}</Option>
              <Option value="professional">{isKo ? "전문직" : "Professional"}</Option>
              <Option value="creator">{isKo ? "크리에이터" : "Creator"}</Option>
              <Option value="student">{isKo ? "학생" : "Student"}</Option>
              <Option value="self_employed">{isKo ? "자영업/프리랜서" : "Self-employed"}</Option>
              <Option value="other">{isKo ? "기타" : "Other"}</Option>
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="text-mutedFg">{isKo ? "근무 형태" : "Work mode"}</span>
            <select
              value={profile.work_mode}
              onChange={(e) => setProfile((prev) => ({ ...prev, work_mode: e.target.value as ProfilePreferences["work_mode"] }))}
              className="h-10 w-full rounded-xl border bg-white/70 px-3"
            >
              <Option value="unknown">{isKo ? "선택하세요" : "Select one"}</Option>
              <Option value="fixed">{isKo ? "고정근무" : "Fixed"}</Option>
              <Option value="flex">{isKo ? "유연근무" : "Flexible"}</Option>
              <Option value="shift">{isKo ? "교대근무" : "Shift"}</Option>
              <Option value="freelance">{isKo ? "프리랜서" : "Freelance"}</Option>
              <Option value="other">{isKo ? "기타" : "Other"}</Option>
            </select>
          </label>
        </div>

        <Button onClick={saveProfile} disabled={saving || loading}>
          {saving ? (isKo ? "저장 중..." : "Saving...") : isKo ? "저장" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
