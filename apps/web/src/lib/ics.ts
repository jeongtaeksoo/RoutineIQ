type RoutineBlock = {
  start: string; // HH:MM
  end: string; // HH:MM
  activity: string;
  goal?: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatLocalDateTime(dt: Date): string {
  // Floating local time: YYYYMMDDTHHMMSS
  return (
    `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}` +
    `T${pad2(dt.getHours())}${pad2(dt.getMinutes())}${pad2(dt.getSeconds())}`
  );
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function buildTomorrowRoutineIcs(opts: {
  routineForDate: string; // YYYY-MM-DD
  blocks: RoutineBlock[];
  uidPrefix?: string;
}): string {
  const [y, m, d] = opts.routineForDate.split("-").map((x) => Number(x));
  const base = new Date(y, (m || 1) - 1, d || 1);

  const uidPrefix = opts.uidPrefix || "routineiq";
  const now = new Date();

  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//RutineIQ//RutineIQ Calendar Export//EN");
  lines.push("CALSCALE:GREGORIAN");

  for (let i = 0; i < (opts.blocks || []).length; i++) {
    const b = opts.blocks[i]!;
    const [sh, sm] = b.start.split(":").map((x) => Number(x));
    const [eh, em] = b.end.split(":").map((x) => Number(x));

    const dtStart = new Date(base);
    dtStart.setHours(sh || 0, sm || 0, 0, 0);
    const dtEnd = new Date(base);
    dtEnd.setHours(eh || 0, em || 0, 0, 0);

    const summary = escapeIcsText(b.activity || "Routine block");
    const description = escapeIcsText(b.goal ? `Goal: ${b.goal}` : "");
    const uid = `${uidPrefix}-${opts.routineForDate}-${i}-${now.getTime()}@routineiq`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatLocalDateTime(now)}`);
    lines.push(`DTSTART:${formatLocalDateTime(dtStart)}`);
    lines.push(`DTEND:${formatLocalDateTime(dtEnd)}`);
    lines.push(`SUMMARY:${summary}`);
    if (description) lines.push(`DESCRIPTION:${description}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

