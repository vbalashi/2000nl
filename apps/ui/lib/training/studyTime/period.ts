import { parseStudyTimePage, type StudyTimePage, type StudyTimeRange } from "./model";

export type StudyTimePeriod = "Today" | "Week" | "Month";
export type StudyTimeWindow = StudyTimePage & { startDate: string; endDate: string; asOf: string };

/** Display projection of the canonical learner-local 04:00 boundary. SQL owns attribution. */
export function studyDateAt(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const localDate = `${part("year")}-${part("month")}-${part("day")}`;
  return Number(part("hour")) < 4 ? shiftStudyDate(localDate, -1) : localDate;
}

function shiftStudyDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export function studyTimeRange(period: StudyTimePeriod, asOf: Date, timezone: string, languageCode: string | null): StudyTimeRange {
  const endDate = studyDateAt(asOf, timezone);
  return { startDate: period === "Week" ? shiftStudyDate(endDate, -6) : period === "Month" ? `${endDate.slice(0, 7)}-01` : endDate, endDate, languageCode };
}

export function parseStudyTimeWindow(value: unknown, period: StudyTimePeriod, languageCode: string | null): StudyTimeWindow | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.asOf !== "string" || !Number.isFinite(Date.parse(v.asOf)) || typeof v.timezone !== "string") return null;
  try {
    const range = studyTimeRange(period, new Date(v.asOf), v.timezone, languageCode);
    if (v.startDate !== range.startDate || v.endDate !== range.endDate) return null;
    const page = parseStudyTimePage(value, range);
    return page ? { ...page, startDate: range.startDate, endDate: range.endDate, asOf: v.asOf } : null;
  } catch { return null; }
}

export function measuredTimeSummary(window: StudyTimeWindow) {
  const coverageDate = studyDateAt(new Date(window.coverageStartedAt), window.timezone);
  return {
    activeMilliseconds: window.days.reduce((sum, day) => sum + day.activeMilliseconds, 0),
    coverage: Date.parse(window.coverageStartedAt) > Date.parse(window.asOf) || coverageDate > window.endDate ? "unavailable" : coverageDate >= window.startDate ? "partial" : "full",
  } as const;
}
