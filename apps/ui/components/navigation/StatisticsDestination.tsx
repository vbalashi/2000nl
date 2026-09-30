"use client";

import React, { useState } from "react";
import { History } from "lucide-react";
import { getUiMessages, formatUiMessage } from "@/lib/uiMessages";
import { sharedArticlePresentationV1Enabled, trainingPresentationV1Enabled } from "@/lib/platform/platformV2Rollout";
import workspace from "@/components/practice/library/libraryWorkspace.module.css";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { DetailedStats } from "@/lib/types";
import { StatisticsActivity } from "@/components/practice/statistics/StatisticsActivity";
import { StatisticsQueue } from "@/components/practice/statistics/StatisticsMaterial";
import statisticsStyles from "@/components/practice/statistics/statistics.module.css";
import { useActivityCalendar } from "@/lib/training/activity/useActivityCalendar";

const copy = {
  nl: {
    title: "Statistieken",
    eyebrow: "Voortgang",
    subtitle: "Een overzicht op basis van je huidige leergegevens.",
    start: "Start training",
    newToday: "Nieuw deze studiedag",
    reviewedToday: "Herhaald deze studiedag",
    dueNow: "Nu te herhalen",
    learned: "Totaal geleerd",
  },
  en: {
    title: "Statistics",
    eyebrow: "Progress",
    subtitle: "An overview based on your current learning data.",
    start: "Start training",
    newToday: "New this study day",
    reviewedToday: "Reviewed this study day",
    dueNow: "Due now",
    learned: "Total learned",
  },
  ru: {
    title: "Статистика",
    eyebrow: "Прогресс",
    subtitle: "Обзор на основе ваших текущих данных обучения.",
    start: "Начать тренировку",
    newToday: "Новых за учебный день",
    reviewedToday: "Повторено за учебный день",
    dueNow: "Нужно повторить",
    learned: "Всего изучено",
  },
} satisfies Record<OnboardingLanguage, Record<string, string>>;

type Props = {
  userId?: string;
  languageCode?: string;
  open: boolean;
  interfaceLanguage: OnboardingLanguage;
  stats: DetailedStats;
  statsStatus?: "pending" | "ready" | "error";
  materialLabel?: string;
  onStartTraining: () => void;
  onHistory?: () => void;
};

export function StatisticsDestination(props: Props) {
  return trainingPresentationV1Enabled() && props.userId && props.languageCode
    ? <ApprovedStatistics {...props} userId={props.userId} languageCode={props.languageCode} />
    : <LegacyStatistics {...props} />;
}

function ApprovedStatistics({ userId, languageCode, open, interfaceLanguage, stats, statsStatus = "ready", materialLabel, onStartTraining, onHistory }: Props & { userId: string; languageCode: string }) {
  const ui = getUiMessages(interfaceLanguage);
  const copy = ui.statistics;
  const [refresh, setRefresh] = useState(0);
  const activity = useActivityCalendar(userId, languageCode, open, refresh);
  const language = new Intl.DisplayNames(interfaceLanguage, { type: "language" }).of(languageCode) ?? languageCode;
  const recentActivity = onHistory ? <button type="button" className={statisticsStyles.recentActivity} onClick={onHistory}>
    <History size={17} aria-hidden="true" />{copy.recentActivity}</button> : null;
  return (
    <section aria-hidden={!open} aria-label={ui.navigation.statistics} className={`${open ? "flex" : "hidden"} h-full min-h-0 flex-col overflow-hidden`}>
      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
        <div className={`${statisticsStyles.statistics} ${statisticsStyles.page}`} lang={interfaceLanguage}>
          <h1 className={statisticsStyles.srOnly}>{ui.navigation.statistics}</h1>
          {activity.status === "ready"
            ? <StatisticsActivity interfaceLanguage={interfaceLanguage} calendar={activity.calendar} recentActivity={recentActivity} />
            : <div className={statisticsStyles.status} aria-live="polite">
              {activity.status === "loading" ? <p role="status">{copy.activityLoading}</p>
                : <><p role="alert">{copy.activityUnavailable}</p><button type="button" onClick={() => setRefresh(n => n + 1)}>{copy.timeRetry}</button></>}
              {recentActivity}
            </div>}
          {statsStatus === "ready" && <StatisticsQueue interfaceLanguage={interfaceLanguage} due={stats.reviewCardsDue}
            description={materialLabel ? `${language} · ${materialLabel}` : language}
            practiseLabel={materialLabel ? formatUiMessage(copy.practise, { material: materialLabel }) : ui.trainingOverview.start}
            onPractise={onStartTraining} />}
          <details className={statisticsStyles.notes}><summary>{copy.about}</summary><p>{copy.accountNotes}</p></details>
        </div>
      </div>
    </section>
  );
}

function LegacyStatistics({
  open,
  interfaceLanguage,
  stats,
  onStartTraining,
  onHistory,
}: Props) {
  const text = copy[interfaceLanguage];
  const total = Math.max(stats.totalWordsInList, 0);
  const progress =
    total > 0
      ? Math.min(100, Math.max(0, (stats.totalWordsLearned / total) * 100))
      : 0;
  const metrics = [
    {
      label: text.newToday,
      value: String(stats.newWordsToday),
    },
    { label: text.reviewedToday, value: String(stats.reviewCardsDone) },
    { label: text.dueNow, value: String(stats.reviewCardsDue) },
    {
      label: text.learned,
      value: `${stats.totalWordsLearned} / ${stats.totalWordsInList}`,
    },
  ];

  return (
    <section
      aria-hidden={!open}
      className={`${open ? "flex" : "hidden"} h-full min-h-0 flex-col overflow-hidden`}
    >
      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                {text.eyebrow}
              </p>
              <h1 className="mt-1 text-3xl font-bold text-slate-950 dark:text-white">
                {text.title}
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {text.subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onStartTraining}
              className="min-h-11 rounded-xl border border-indigo-500 bg-indigo-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-500"
            >
              {text.start}
            </button>
          </div>

          {sharedArticlePresentationV1Enabled() && onHistory && <button type="button" className={workspace.button} onClick={onHistory}>
            <History size={16} aria-hidden="true" />{getUiMessages(interfaceLanguage).statistics.recentActivity}
          </button>}
          <div className="mt-7 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {metrics.map((metric) => (
              <section
                key={metric.label}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em] dark:text-slate-400">
                  {metric.label}
                </p>
                <p className="mt-3 text-2xl font-bold text-slate-950 sm:mt-4 sm:text-3xl dark:text-white">
                  {metric.value}
                </p>
              </section>
            ))}
          </div>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4 text-sm font-semibold">
              <span>{text.learned}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
