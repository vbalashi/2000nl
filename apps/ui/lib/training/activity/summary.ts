import { studyDateAt, type StudyTimePeriod } from "../studyTime/period";
import type { ActivityCalendar, ActivityDay } from "./model";

export type TimeCoverage = "full" | "partial" | "unavailable";
export type ActivityPeriodSummary = {
  startDate: string; endDate: string; newCount: number; reviewCount: number; activeDays: number;
  activeMilliseconds: number; timeCoverage: TimeCoverage;
};
export type ActivityHighlights = { currentStreak: number; longestStreak: number; bestDay: number; dailyAverage: number };

export const dayTotal = (day: ActivityDay) => day.newCount + day.reviewCount;

export function activityLevel(total: number): 0 | 1 | 2 | 3 {
  return total === 0 ? 0 : total < 15 ? 1 : total < 30 ? 2 : 3;
}

/** First study day with measured time, or null before measurement exists. */
export function coverageDate(calendar: ActivityCalendar): string | null {
  return calendar.coverageStartedAt ? studyDateAt(new Date(calendar.coverageStartedAt), calendar.timezone) : null;
}

export function timeCoverage(calendar: ActivityCalendar, startDate: string, endDate: string): TimeCoverage {
  const first = coverageDate(calendar);
  return first === null || first > endDate ? "unavailable" : first >= startDate ? "partial" : "full";
}

export function periodSummary(calendar: ActivityCalendar, period: StudyTimePeriod): ActivityPeriodSummary {
  const endDate = calendar.today;
  const startDate = period === "Today" ? endDate : period === "Week" ? calendar.days.at(-7)!.date : `${endDate.slice(0, 7)}-01`;
  const days = calendar.days.filter(day => day.date >= startDate);
  return {
    startDate, endDate,
    newCount: days.reduce((sum, day) => sum + day.newCount, 0),
    reviewCount: days.reduce((sum, day) => sum + day.reviewCount, 0),
    activeDays: days.filter(day => dayTotal(day) > 0).length,
    activeMilliseconds: days.reduce((sum, day) => sum + day.activeMilliseconds, 0),
    timeCoverage: timeCoverage(calendar, startDate, endDate),
  };
}

/** Streaks allow today to remain unfinished; averages include inactive days. */
export function activityHighlights(calendar: ActivityCalendar): ActivityHighlights {
  const totals = calendar.days.map(dayTotal);
  let longestStreak = 0, run = 0;
  for (const total of totals) { run = total > 0 ? run + 1 : 0; longestStreak = Math.max(longestStreak, run); }
  let currentStreak = 0;
  for (let i = totals.length - 1 - (totals.at(-1) === 0 ? 1 : 0); i >= 0 && totals[i] > 0; i--) currentStreak++;
  const recent = totals.slice(-30);
  return {
    currentStreak, longestStreak,
    bestDay: Math.max(0, ...totals),
    dailyAverage: Math.round(recent.reduce((sum, total) => sum + total, 0) / 30),
  };
}
