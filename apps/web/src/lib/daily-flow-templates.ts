export type DailyFlowEntry = {
  start: string;
  end: string;
  activity: string;
  energy?: number | null;
  focus?: number | null;
  tags?: string[];
  note?: string | null;
};

export const DAILY_FLOW_TEMPLATES: Record<string, DailyFlowEntry[]> = {
  "Deep Work Day": [
    { start: "09:00", end: "10:30", activity: "Deep work (priority 1)", energy: 4, focus: 4 },
    { start: "10:45", end: "12:00", activity: "Deep work (priority 2)", energy: 4, focus: 4 },
    { start: "13:00", end: "13:30", activity: "Admin + messages", energy: 3, focus: 2 },
    { start: "14:00", end: "15:30", activity: "Creative / writing", energy: 3, focus: 4 }
  ],
  "Balanced Day": [
    { start: "09:00", end: "09:30", activity: "Planning + setup", energy: 3, focus: 3 },
    { start: "09:30", end: "10:30", activity: "Deep work sprint", energy: 4, focus: 4 },
    { start: "11:00", end: "12:00", activity: "Meetings / collaboration", energy: 3, focus: 2 },
    { start: "14:00", end: "15:00", activity: "Execution", energy: 3, focus: 3 },
    { start: "16:00", end: "16:30", activity: "Wrap-up", energy: 2, focus: 2 }
  ],
  "Light Day": [
    { start: "10:00", end: "10:30", activity: "Planning", energy: 2, focus: 3 },
    { start: "11:00", end: "12:00", activity: "Shallow tasks", energy: 2, focus: 2 },
    { start: "15:00", end: "15:30", activity: "Review + cleanup", energy: 2, focus: 2 }
  ]
};

export const DEFAULT_TEMPLATE_NAME = "Balanced Day";

