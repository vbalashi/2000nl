"use client";
import React, { useEffect, useId, useState, type ReactNode } from "react";
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
  const [view,setView]=useState<"daily"|"weekly">("daily");
  const viewLabels=locale==="ru"?["По дням","По неделям"]:locale==="nl"?["Dagelijks","Wekelijks"]:["Daily","Weekly"];
  const [page, setPage] = useState(0);
  const [tip, setTip] = useState<{date:string;x:number;y:number}|null>(null);
  const tipId = useId();
  useEffect(()=>{const dismiss=()=>setTip(null);window.addEventListener("scroll",dismiss,true);window.addEventListener("resize",dismiss);return()=>{window.removeEventListener("scroll",dismiss,true);window.removeEventListener("resize",dismiss);};},[]);
  const showTip = (day:ActivityDay, target:HTMLButtonElement) => {const rect=target.getBoundingClientRect();setTip({date:day.date,x:Math.max(120,Math.min(window.innerWidth-120,rect.left+rect.width/2)),y:Math.min(window.innerHeight-90,rect.bottom+8)});};
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
    return <button key={day.date} type="button" data-level={activityLevel(dayTotal(day))} aria-pressed={selected === day.date} aria-label={label} aria-describedby={tip?.date===day.date?tipId:undefined} onMouseEnter={e=>showTip(day,e.currentTarget)} onMouseLeave={()=>setTip(null)} onFocus={e=>showTip(day,e.currentTarget)} onBlur={()=>setTip(null)} onKeyDown={e=>{if(e.key==="Escape")setTip(null);}} onClick={e=>{setSelected(day.date);showTip(day,e.currentTarget);}} />;
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
  const weeks=Array.from({length:columns},(_,index)=>calendar.days.slice(Math.max(0,index*7-lead),(index+1)*7-lead)).filter(days=>days.length);
  const maxWeek=Math.max(1,...weeks.map(days=>days.reduce((total,day)=>total+dayTotal(day),0)));
  const weekCell=(days:ActivityDay[])=>{const firstDay=days[0],lastDay=days[days.length-1];const total=days.reduce((n,day)=>n+dayTotal(day),0);const bars=total?Math.max(1,Math.ceil(total/maxWeek*7)):0;const label=`${dateRange(firstDay.date,lastDay.date)}: ${number(total)}`;
    return <button key={firstDay.date} className={s.weekColumn} type="button" aria-label={label} aria-describedby={tip?.date===firstDay.date?tipId:undefined} onMouseEnter={e=>showTip(firstDay,e.currentTarget)} onMouseLeave={()=>setTip(null)} onFocus={e=>showTip(firstDay,e.currentTarget)} onBlur={()=>setTip(null)} onKeyDown={e=>{if(e.key==="Escape")setTip(null);}} onClick={e=>showTip(firstDay,e.currentTarget)}>{Array.from({length:7},(_,i)=><i key={i} data-filled={i>=7-bars}/>)}</button>;};
  const chosenWeek= view==="weekly"&&tip?weeks.find(days=>days[0].date===tip.date):null;
  const chosen = tip ? calendar.days.find(day => day.date === tip.date) ?? null : null;
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
    <section className={`${s.section} ${s.history}`} aria-label={copy.studyActivity}>
      <div className={s.calendarToolbar}><SegmentedControl standard label={copy.studyActivity}>{(["daily","weekly"] as const).map((value,index)=><button type="button" key={value} aria-pressed={view===value} onClick={()=>{setView(value);setTip(null);}}>{viewLabels[index]}</button>)}</SegmentedControl></div>
      <div className={s.desktopHeat}><div className={s.heatScroll}>
        <div className={view==="weekly"?s.weekGrid:s.heatGrid} role="group" aria-label={view==="weekly"?`${copy.studyActivity} · ${viewLabels[1]}`:copy.yearHeatmap}>{view==="weekly"?weeks.map(weekCell):<>{Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}{calendar.days.map(cell)}</>}</div>
        <div className={s.monthLabels} style={{ "--heat-columns": columns } as React.CSSProperties}>{monthLabels.map(item => <span key={item.id} style={{ gridColumn: item.column }}>{item.label}</span>)}</div>
      </div></div>
      <div className={s.mobileHeat}>
        <div className={s.mobileHistoryNav}>
          <button type="button" aria-label={copy.earlierMonths} disabled={!hasEarlier} onClick={() => { setPage(p => p + 1); setSelected(null); setTip(null); }}><ChevronLeft size={16} /></button>
          <span>{`${monthName(windowStart)} – ${monthName(monthStart(page * MOBILE_MONTHS))}`}</span>
          <button type="button" aria-label={copy.laterMonths} disabled={page === 0} onClick={() => { setPage(p => p - 1); setSelected(null); setTip(null); }}><ChevronRight size={16} /></button>
        </div>
        <div className={view==="weekly"?`${s.mobileWeekGrid} ${s.weekGrid}`:s.mobileHeatGrid} role="group" aria-label={view==="weekly"?`${copy.studyActivity} · ${viewLabels[1]}`:copy.monthHeatmap}>
          {view==="weekly"?weeks.filter(days=>days.some(day=>day.date>=windowStart&&day.date<windowEnd)).map(weekCell):<>{Array.from({ length: mobileDays.length ? weekdayOffset(mobileDays[0].date) : 0 }, (_, i) => <span key={`blank-${i}`} />)}{mobileDays.map(cell)}</>}
        </div>
      </div>

      {chosen && tip && <div id={tipId} role="tooltip" className={s.dayTooltip} style={{left:tip.x,top:tip.y}}><strong>{chosenWeek?dateRange(chosenWeek[0].date,chosenWeek[chosenWeek.length-1].date):dateFormat.format(utcDate(chosen.date))}</strong>
        <span>{daySummary(chosenWeek?{date:chosenWeek[0].date,newCount:chosenWeek.reduce((n,d)=>n+d.newCount,0),reviewCount:chosenWeek.reduce((n,d)=>n+d.reviewCount,0),activeMilliseconds:chosenWeek.reduce((n,d)=>n+d.activeMilliseconds,0)}:chosen)}{!chosenWeek && dayTotal(chosen) === 0 ? ` · ${copy.noActivity}` : ""}</span></div>}
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
