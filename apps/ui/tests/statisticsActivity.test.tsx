import React from "react";
import { describe, expect, test } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { parseActivityCalendar, shiftDate, type ActivityCalendar } from "@/lib/training/activity/model";
import { activityHighlights, periodSummary } from "@/lib/training/activity/summary";
import {getUiMessages} from "@/lib/uiMessages";
import { StatisticsActivity } from "@/components/practice/statistics/StatisticsActivity";

const today = "2026-09-30";
function calendar(activity: Record<number, [number, number, number?]> = {}, coverageStartedAt: string | null = "2025-01-01T00:00:00Z"): ActivityCalendar {
  return { timezone: "Europe/Amsterdam", today, coverageStartedAt, days: Array.from({ length: 366 }, (_, i) => {
    const [fresh = 0, reviews = 0, ms = 0] = activity[365 - i] ?? [];
    return { date: shiftDate(today, i - 365), newCount: fresh, reviewCount: reviews, activeMilliseconds: ms };
  }) };
}

describe("activity calendar model", () => {
  test("accepts only complete consecutive calendars ending on the server study day", () => {
    const value = calendar();
    expect(parseActivityCalendar(value)).toEqual(value);
    expect(parseActivityCalendar({ ...value, days: value.days.slice(1) })).toBeNull();
    expect(parseActivityCalendar({ ...value, days: [...value.days.slice(1), value.days[0]] })).toBeNull();
    expect(parseActivityCalendar({ ...value, days: value.days.map((d, i) => i ? d : { ...d, newCount: 1.5 }) })).toBeNull();
    expect(parseActivityCalendar({ ...value, coverageStartedAt: "soon" })).toBeNull();
    expect(parseActivityCalendar({ ...value, coverageStartedAt: null })).not.toBeNull();
  });

  test("summarises Today, the last seven study days and the current study month", () => {
    // Offsets are days before today.
    const value = calendar({ 0: [2, 3, 90000], 6: [1, 0, 30000], 7: [4, 4], 29: [5, 5] });
    expect(periodSummary(value, "Today")).toMatchObject({ startDate: today, newCount: 2, reviewCount: 3, activeDays: 1, activeMilliseconds: 90000, timeCoverage: "full" });
    expect(periodSummary(value, "Week")).toMatchObject({ startDate: "2026-09-24", newCount: 3, reviewCount: 3, activeDays: 2, activeMilliseconds: 120000 });
    expect(periodSummary(value, "Month")).toMatchObject({ startDate: "2026-09-01", newCount: 12, reviewCount: 12, activeDays: 4 });
  });

  test("distinguishes unmeasured and partially measured time from a measured zero", () => {
    expect(periodSummary(calendar({}, null), "Week").timeCoverage).toBe("unavailable");
    expect(periodSummary(calendar({}, "2026-09-28T10:00:00Z"), "Week").timeCoverage).toBe("partial");
    expect(periodSummary(calendar({}, "2026-09-28T10:00:00Z"), "Today").timeCoverage).toBe("full");
    // 03:00 Amsterdam on 1 October belongs to the 30 September study day.
    expect(periodSummary(calendar({}, "2026-10-01T01:00:00Z"), "Today").timeCoverage).toBe("partial");
  });

  test("streaks tolerate an unfinished today, and averages include inactive days", () => {
    expect(activityHighlights(calendar({ 1: [1, 0], 2: [0, 1], 3: [2, 0], 5: [40, 0] }))).toEqual({ currentStreak: 3, longestStreak: 3, bestDay: 40, dailyAverage: 1 });
    expect(activityHighlights(calendar({ 0: [1, 0], 1: [1, 0] })).currentStreak).toBe(2);
    expect(activityHighlights(calendar({ 2: [1, 0] })).currentStreak).toBe(0);
    expect(activityHighlights(calendar())).toEqual({ currentStreak: 0, longestStreak: 0, bestDay: 0, dailyAverage: 0 });
  });
});

describe("StatisticsActivity presentation", () => {
  test("renders real period metrics, time coverage and day details in the interface locale", () => {
    render(<StatisticsActivity interfaceLanguage="ru" calendar={calendar({ 0: [2, 0, 249436], 1: [0, 3] }, "2026-09-30T18:54:00Z")} />);
    expect(screen.getByRole("button", { name: "Неделя" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Время занятий").previousSibling).toHaveTextContent("4 мин");
    expect(screen.queryByText(/Измеряется с/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сегодня" }));
    expect(screen.getByText("Повторения завершены").previousSibling).toHaveTextContent("0");
    const year = screen.getByRole("group", { name: "Учебная активность по дням за год" });
    const yesterday = within(year).getAllByRole("button").at(-2)!;
    expect(yesterday).toHaveAttribute("data-level", "1");
    fireEvent.click(yesterday);
    expect(screen.getByText(/время не измерялось/)).toBeInTheDocument();
  });

  test("uses a dash for unmeasured periods instead of a fabricated zero", () => {
    render(<StatisticsActivity interfaceLanguage="en" calendar={calendar({}, null)} />);
    expect(screen.getByText("Study time").previousSibling).toHaveTextContent("—");
    expect(screen.getByText("Time was not measured during this period.")).toBeInTheDocument();
  });
});

 test("calendar details appear only in an anchored tooltip and dismiss on leave or Escape",()=>{
  render(<StatisticsActivity interfaceLanguage="en" calendar={calendar({0:[2,3,60000]})}/>);
  expect(screen.queryByRole("tooltip")).toBeNull();
  const year=screen.getByRole("group",{name:getUiMessages("en").statistics.yearHeatmap});
  const day=within(year).getAllByRole("button").at(-1)!;
  fireEvent.mouseEnter(day);
  expect(screen.getByRole("tooltip")).toHaveTextContent("September 30, 2026");
  expect(day).toHaveAttribute("aria-describedby",screen.getByRole("tooltip").id);
  expect(day).not.toHaveAttribute("title");
  fireEvent.mouseLeave(day);expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.focus(day);expect(screen.getByRole("tooltip")).toBeVisible();
  fireEvent.keyDown(day,{key:"Escape"});expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.click(day);expect(screen.getByRole("tooltip")).toHaveTextContent("reviews: 3");
 });

 test("weekly columns sum actual days and preserve the daily view",()=>{
 render(<StatisticsActivity interfaceLanguage="en" calendar={calendar({0:[2,3,60000],1:[4,1,120000]})}/>);
 expect(screen.queryByText("Study activity")).toBeNull();
 expect(screen.queryByText("More activity")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Weekly"}));
 const grid=screen.getAllByRole("group",{name:`${getUiMessages("en").statistics.studyActivity} · Weekly`})[0];
 expect(within(grid).getAllByRole("button").length).toBeLessThan(55);
 fireEvent.click(within(grid).getAllByRole("button").at(-1)!);
 expect(screen.getByRole("tooltip")).toHaveTextContent("New exercises: 6 · reviews: 4 · 3 min");
 fireEvent.click(screen.getByRole("button",{name:"Daily"}));
 expect(within(grid).getAllByRole("button")).toHaveLength(366);
 });
