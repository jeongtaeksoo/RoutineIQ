import { redirect } from "next/navigation";

export default function PreferencesPage() {
  redirect("/app/insights?settings=1&settingsTab=profile");
}
