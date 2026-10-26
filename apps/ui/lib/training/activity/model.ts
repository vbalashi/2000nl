export type ActivityDay = { date: string; newCount: number; reviewCount: number; activeMilliseconds: number };
export type ActivityCalendar = { timezone: string; today: string; coverageStartedAt: string | null; days: ActivityDay[] };
export const ACTIVITY_CALENDAR_DAYS = 366;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** Accepts only a complete, consecutive server calendar ending on its own current study day. */
export function parseActivityCalendar(value: unknown, expectedDays = ACTIVITY_CALENDAR_DAYS): ActivityCalendar | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.timezone !== "string" || !v.timezone || typeof v.today !== "string" || !DATE.test(v.today)) return null;
  const coverage = v.coverageStartedAt ?? null;
  if (coverage !== null && (typeof coverage !== "string" || !Number.isFinite(Date.parse(coverage)))) return null;
  if (!Array.isArray(v.days) || v.days.length !== expectedDays) return null;
  const days: ActivityDay[] = [];
  for (const [index, raw] of v.days.entries()) {
    if (!raw || typeof raw !== "object") return null;
    const d = raw as Record<string, unknown>;
    if (d.date !== shiftDate(v.today, index - expectedDays + 1) || !count(d.newCount) || !count(d.reviewCount) || !count(d.activeMilliseconds)) return null;
    days.push({ date: d.date as string, newCount: d.newCount as number, reviewCount: d.reviewCount as number, activeMilliseconds: d.activeMilliseconds as number });
  }
  return { timezone: v.timezone, today: v.today, coverageStartedAt: coverage as string | null, days };
}
