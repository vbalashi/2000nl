"use client";
import React, { useId } from "react";
import { ArrowUpRight } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { formatUiCount, formatUiMessage, getUiMessages } from "@/lib/uiMessages";
import s from "./statistics.module.css";

/** Approved review queue for one resolved material scope. */
export function StatisticsQueue({ interfaceLanguage: locale, due, description, practiseLabel, onPractise }: {
  interfaceLanguage: OnboardingLanguage; due: number; description: string; practiseLabel: string; onPractise?: () => void;
}) {
  const copy = getUiMessages(locale).statistics;
  return <section className={s.queue} lang={locale}>
    <div><span className={s.queueLabel}>{copy.dueNow}</span><h2>{formatUiCount(locale, due, copy, "ready")}</h2><p>{description} · {copy.readyNow}</p></div>
    {onPractise && <button type="button" onClick={onPractise}>{practiseLabel}<ArrowUpRight size={15} aria-hidden="true" /></button>}
  </section>;
}

/** Approved started/total coverage for one resolved material scope. */
export function StatisticsCoverage({ interfaceLanguage: locale, started, total, scopeLabel }: {
  interfaceLanguage: OnboardingLanguage; started: number; total: number; scopeLabel: string;
}) {
  const copy = getUiMessages(locale).statistics;
  const id = useId();
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const ratio = total > 0 ? Math.min(1, Math.max(0, started / total)) : 0;
  return <section className={s.section} aria-labelledby={id} lang={locale}>
    <div className={s.sectionHeading}><h2 id={id}>{copy.coverage}</h2><span>{scopeLabel}</span></div>
    <p className={s.progressTotal}><strong>{number(started)}</strong><span>{formatUiMessage(copy.ofCards, { total: number(total) })}</span></p>
    <div className={s.bar} role="progressbar" aria-label={copy.cardsStarted} aria-valuemin={0} aria-valuemax={total} aria-valuenow={started}><span style={{ width: `${ratio * 100}%` }} /></div>
    <div className={s.legend}>
      <span>{formatUiMessage(copy.started, { percent: new Intl.NumberFormat(locale, { style: "percent", maximumSignificantDigits: started > 0 && ratio < 0.01 ? 1 : undefined }).format(ratio) })}</span>
      <span>{formatUiMessage(copy.notStarted, { count: number(Math.max(0, total - started)) })}</span>
    </div>
    <p className={s.hint}>{copy.coverageHint}</p>
  </section>;
}
