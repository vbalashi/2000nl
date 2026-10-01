"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import s from "./recentActivity.module.css";

export type ActivityRow = {
  id: string;
  word: string;
  at: string;
  exercise: string;
  result: string;
  tone: "Again" | "Hard" | "Good" | "Easy" | "Known" | "Excluded" | "Started";
};

/** Shared presentation; action identity, scope and loading stay with the caller. */
export function RecentActivityList({ items, locale, scopeLabel, emptyLabel, listLabel }: {
  items: ActivityRow[];
  locale: OnboardingLanguage;
  scopeLabel: string;
  emptyLabel: string;
  listLabel: string;
}) {
  const dates = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });
  const times = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const groups = new Map<string, ActivityRow[]>();
  for (const item of items) {
    const day = dates.format(new Date(item.at));
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return <div className={s.history}>
    <p className={s.scope}>{scopeLabel}</p>
    {!items.length && <p className={s.empty}>{emptyLabel}</p>}
    <div role="group" aria-label={listLabel}>
      {[...groups].map(([day, actions]) => <section key={day}>
        <h3>{day}</h3>
        <ol>{actions.map(item => <li key={item.id}>
          <div className={s.word}><strong>{item.word}</strong><span>{item.exercise}</span></div>
          <div className={s.result}><strong data-rating={item.tone}>{item.result}</strong>
            <time dateTime={item.at}>{times.format(new Date(item.at))}</time>
          </div>
        </li>)}</ol>
      </section>)}
    </div>
  </div>;
}
