"use client";
import React, { useId, useState } from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages, formatUiMessage } from "@/lib/uiMessages";
import { measuredTimeSummary, type StudyTimePeriod } from "@/lib/training/studyTime/period";
import { useStudyTimeWindow } from "@/lib/training/studyTime/useStudyTimeWindow";
import s from "./measuredStudyTime.module.css";

export function MeasuredStudyTime({ ownerId, languageCode, interfaceLanguage, open }: {
  ownerId: string; languageCode: string; interfaceLanguage: OnboardingLanguage; open: boolean;
}) {
  const copy = getUiMessages(interfaceLanguage).statistics;
  const [period, setPeriod] = useState<StudyTimePeriod>("Today");
  const [refresh, setRefresh] = useState(0);
  const state = useStudyTimeWindow(ownerId, languageCode, period, open, refresh);
  const id = useId();
  const language = new Intl.DisplayNames(interfaceLanguage, { type: "language" }).of(languageCode) ?? languageCode;
  const summary = state.status === "ready" ? measuredTimeSummary(state.window) : null;
  const milliseconds = summary?.activeMilliseconds ?? 0;
  const value = summary?.coverage === "unavailable" || state.status !== "ready" ? "—" : milliseconds > 0 && milliseconds < 60000
    ? copy.lessThanMinute : formatUiMessage(copy.minutes, { count: new Intl.NumberFormat(interfaceLanguage).format(Math.floor(milliseconds / 60000)) });
  const dateFormat = state.status === "ready" ? new Intl.DateTimeFormat(interfaceLanguage, { dateStyle: "medium", timeStyle: "short", timeZone: state.window.timezone }) : null;
  const calendarFormat = new Intl.DateTimeFormat(interfaceLanguage, { dateStyle: "medium", timeZone: "UTC" });
  return <section className={s.summary} aria-labelledby={id} aria-busy={state.status === "loading"} lang={interfaceLanguage}>
    <div className={s.heading}><h2 id={id}>{copy.studyTime}</h2>
      <div className={s.periods} role="group" aria-label={copy.activityPeriod}>
        {(["Today", "Week", "Month"] as const).map(p => <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>{copy.periods[p]}</button>)}
      </div>
    </div>
    <p className={s.scope}>{language} · {copy.measuredScope}</p>
    {state.status === "ready" && <p className={s.scope}>{calendarFormat.formatRange(new Date(`${state.window.startDate}T00:00:00Z`), new Date(`${state.window.endDate}T00:00:00Z`))}</p>}
    <p className={s.value}>{value}</p>
    <div className={s.status} aria-live="polite">
      {state.status === "loading" ? <p role="status">{copy.timeLoading}</p>
        : state.status === "error" ? <><p role="alert">{copy.timeUnavailable}</p><button type="button" onClick={() => setRefresh(n => n + 1)}>{copy.timeRetry}</button></>
        : summary?.coverage === "unavailable" ? <p>{copy.timeUnmeasured}</p>
        : <><p>{copy.activeTimeHint}</p>{state.status === "ready" && summary?.coverage === "partial" && <p>{formatUiMessage(copy.measuredSince, { date: dateFormat!.format(new Date(state.window.coverageStartedAt)) })}</p>}</>}
    </div>
  </section>;
}
