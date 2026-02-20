import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isE2ETestMode } from "@/lib/supabase/env";

function isProfileComplete(profile: {
  age_group?: string | null;
  gender?: string | null;
  job_family?: string | null;
  work_mode?: string | null;
} | null): boolean {
  if (!profile) return false;
  const required = [
    profile.age_group,
    profile.gender,
    profile.job_family,
    profile.work_mode,
  ];
  return required.every((v) => typeof v === "string" && v.trim() && v !== "unknown");
}

export default async function AppIndexPage() {
  if (isE2ETestMode()) {
    redirect("/app/today");
  }

  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const [profileRes, logRes, reportRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("age_group,gender,job_family,work_mode")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("activity_logs").select("id").eq("user_id", user.id).limit(1),
    supabase.from("ai_reports").select("id").eq("user_id", user.id).limit(1),
  ]);

  const profileComplete = isProfileComplete(profileRes.data ?? null);
  const hasAnyLog = (logRes.data?.length ?? 0) > 0;
  const hasAnyReport = (reportRes.data?.length ?? 0) > 0;
  const activationComplete = profileComplete && hasAnyLog && hasAnyReport;

  redirect(activationComplete ? "/app/today" : "/app/onboarding");
}
