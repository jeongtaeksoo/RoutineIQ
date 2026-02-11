import { redirect } from "next/navigation";

function localYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ReportsIndexPage() {
  redirect(`/app/reports/${localYYYYMMDD()}`);
}
