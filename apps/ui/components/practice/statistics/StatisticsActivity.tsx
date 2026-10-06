"use client";
import React, { useId, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { formatUiCount, formatUiMessage, getUiMessages } from "@/lib/uiMessages";
import type { StudyTimePeriod } from "@/lib/training/studyTime/period";
import type { ActivityCalendar, ActivityDay } from "@/lib/training/activity/model";
import { activityHighlights, activityLevel, coverageDate, dayTotal, periodSummary } from "@/lib/training/activity/summary";
import s from "./statistics.module.css";
import {SegmentedControl} from "../ui/SegmentedControl";

const utcDate = (date: string) => new Date(`${date}T00:00:00Z`);
const weekdayOffset = (date: string) => (utcDate(date).getUTCDay() + 6) % 7;
const MOBILE_MONTHS = 3;

/** Approved Activity, study calendar and highlights over one server-owned activity calendar. */
export function StatisticsActivity({ interfaceLanguage: locale, calendar, recentActivity }: {
  interfaceLanguage: OnboardingLanguage; calendar: ActivityCalendar; recentActivity?: ReactNode;
}) {
  const copy = getUiMessages(locale).statistics;
  const [period, setPeriod] = useState<StudyTimePeriod>("Week");
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const ids = { activity: useId(), history: useId(), highlights: useId() };
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const dateRange = (first: string, last: string) => dateFormat.formatRange(utcDate(first), utcDate(last));
  const minutes = (ms: number) => ms > 0 && ms < 60000 ? copy.lessThanMinute : formatUiMessage(copy.minutes, { count: number(Math.floor(ms / 60000)) });
  const measuredFrom = coverageDate(calendar);
  const summary = periodSummary(calendar, period);
  const highlights = activityHighlights(calendar);
  const daySummary = (day: ActivityDay) => formatUiMessage(copy.daySummary, {
    fresh: number(day.newCount), reviews: number(day.reviewCount),
    minutes: measuredFrom !== null && day.date >= measuredFrom ? minutes(day.activeMilliseconds) : copy.timeNotMeasured,
  });
  const cell = (day: ActivityDay) => {
    const label = formatUiMessage(copy.dayAccessible, { date: dateFormat.format(utcDate(day.date)), summary: daySummary(day) });
    return <button key={day.date} type="button" data-level={activityLevel(dayTotal(day))} aria-pressed={selected === day.date} aria-label={label} title={label} onClick={() => setSelected(day.date)} />;
  };
  const first = calendar.days[0].date;
  const lead = weekdayOffset(first);
  const columns = Math.ceil((lead + calendar.days.length) / 7);
  const monthLabels = calendar.days.flatMap((day, index) => day.date.endsWith("-01")
    ? [{ id: day.date, label: utcDate(day.date).toLocaleDateString(locale, { month: "short", timeZone: "UTC" }), column: Math.floor((index + lead) / 7) + 1 }] : []);
  const monthStart = (offset: number) => { const d = utcDate(`${calendar.today.slice(0, 7)}-01`); d.setUTCMonth(d.getUTCMonth() - offset); return d.toISOString().slice(0, 10); };
  const windowStart = monthStart(page * MOBILE_MONTHS + MOBILE_MONTHS - 1);
  const windowEnd = monthStart(page * MOBILE_MONTHS - 1);
  const mobileDays = calendar.days.filter(day => day.date >= windowStart && day.date < windowEnd);
  const hasEarlier = first < windowStart;
  const monthName = (date: string) => utcDate(date).toLocaleDateString(locale, { month: "short", year: "numeric", timeZone: "UTC" });
  const chosen = selected ? calendar.days.find(day => day.date === selected) ?? null : null;
  const timeValue = summary.timeCoverage === "unavailable" ? "—" : minutes(summary.activeMilliseconds);
  return <div className={s.statistics} lang={locale}>
    <section className={s.section} aria-labelledby={ids.activity}>
      <div className={s.sectionHeading}><h2 id={ids.activity}>{copy.activity}</h2>
        <SegmentedControl standard label={copy.activityPeriod}>{(["Today", "Week", "Month"] as const).map(value =>
          <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}>{copy.periods[value]}</button>)}</SegmentedControl>
      </div>
      <p className={s.range}>{summary.startDate === summary.endDate ? dateFormat.format(utcDate(summary.endDate)) : dateRange(summary.startDate, summary.endDate)}</p>
      <div className={s.activityNumbers}>
        <Metric value={number(summary.newCount)} label={copy.newExercises} />
        <Metric value={number(summary.reviewCount)} label={copy.reviewsCompleted} />
        <Metric value={number(summary.activeDays)} label={copy.activeDays} />
        <Metric value={timeValue} label={copy.studyTime} />
      </div>
      {summary.timeCoverage === "unavailable" && <p className={s.note}>{copy.timeUnmeasured}</p>}
    </section>
    {recentActivity}
    <section className={`${s.section} ${s.history}`} aria-labelledby={ids.history}>
      <div className={s.sectionHeading}><h2 id={ids.history}>{copy.studyActivity}</h2><span>{dateRange(first, calendar.today)}</span></div>
      <div className={s.desktopHeat}><div className={s.heatScroll}>
        <div className={s.heatGrid} role="group" aria-label={copy.yearHeatmap}>{Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}{calendar.days.map(cell)}</div>
        <div className={s.monthLabels} style={{ "--heat-columns": columns } as React.CSSProperties}>{monthLabels.map(item => <span key={item.id} style={{ gridColumn: item.column }}>{item.label}</span>)}</div>
      </div></div>
      <div className={s.mobileHeat}>
        <div className={s.mobileHistoryNav}>
          <button type="button" aria-label={copy.earlierMonths} disabled={!hasEarlier} onClick={() => { setPage(p => p + 1); setSelected(null); }}><ChevronLeft size={16} /></button>
          <span>{`${monthName(windowStart)} – ${monthName(monthStart(page * MOBILE_MONTHS))}`}</span>
          <button type="button" aria-label={copy.laterMonths} disabled={page === 0} onClick={() => { setPage(p => p - 1); setSelected(null); }}><ChevronRight size={16} /></button>
        </div>
        <div className={s.mobileHeatGrid} role="group" aria-label={copy.monthHeatmap}>
          {Array.from({ length: mobileDays.length ? weekdayOffset(mobileDays[0].date) : 0 }, (_, i) => <span key={`blank-${i}`} />)}{mobileDays.map(cell)}
        </div>
      </div>
      <div className={s.heatLegend} aria-hidden="true"><span>{copy.less}</span>{[0, 1, 2, 3].map(level => <i key={level} data-level={level} />)}<span>{copy.moreActivity}</span></div>
      <div className={s.dayDetail} aria-live="polite">{chosen ? <><strong>{dateFormat.format(utcDate(chosen.date))}</strong>
        <span>{daySummary(chosen)}{dayTotal(chosen) === 0 ? ` · ${copy.noActivity}` : ""}</span></> : <span>{copy.selectDay}</span>}</div>
    </section>
    <section className={s.section} aria-labelledby={ids.highlights}>
      <h2 id={ids.highlights} className={s.highlightsTitle}>{copy.highlights}</h2>
      <div className={s.highlights}>
        <Metric value={formatUiCount(locale, highlights.currentStreak, copy, "day")} label={copy.currentStreak} />
        <Metric value={formatUiCount(locale, highlights.longestStreak, copy, "day")} label={copy.longestStreak} />
        <Metric value={number(highlights.bestDay)} label={copy.bestDay} />
        <Metric value={number(highlights.dailyAverage)} label={copy.average} />
      </div>
    </section>
  </div>;
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}
