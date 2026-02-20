import { redirect } from "next/navigation";

export default function PreferencesPage() {
  redirect("/app/settings/profile");
}
