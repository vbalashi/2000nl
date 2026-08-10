"use client";

import React from "react";
import { BrandLogo } from "@/components/BrandLogo";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { DetailedStats } from "@/lib/types";
import { AppDestinationNav } from "./AppDestinationNav";
import { AppUtilityNav, type AppUtilityNavProps } from "./AppUtilityNav";
import type { AppDestination } from "./appDestination";

const copy = {
  nl: {
    title: "Statistieken",
    eyebrow: "Voortgang",
    subtitle: "Een overzicht op basis van je huidige leergegevens.",
    back: "Terug naar Training",
    start: "Start training",
    newToday: "Nieuw vandaag",
    reviewedToday: "Herhaald vandaag",
    dueNow: "Nu te herhalen",
    learned: "Totaal geleerd",
  },
  en: {
    title: "Statistics",
    eyebrow: "Progress",
    subtitle: "An overview based on your current learning data.",
    back: "Back to Training",
    start: "Start training",
    newToday: "New today",
    reviewedToday: "Reviewed today",
    dueNow: "Due now",
    learned: "Total learned",
  },
  ru: {
    title: "Статистика",
    eyebrow: "Прогресс",
    subtitle: "Обзор на основе ваших текущих данных обучения.",
    back: "Вернуться к тренировке",
    start: "Начать тренировку",
    newToday: "Новых сегодня",
    reviewedToday: "Повторено сегодня",
    dueNow: "Нужно повторить",
    learned: "Всего изучено",
  },
} satisfies Record<OnboardingLanguage, Record<string, string>>;

type Props = {
  open: boolean;
  interfaceLanguage: OnboardingLanguage;
  stats: DetailedStats;
  onNavigate: (destination: AppDestination) => void;
  utilityNav: Omit<
    AppUtilityNavProps,
    "interfaceLanguage" | "settingsActive" | "historyActive"
  >;
};

export function StatisticsDestination({
  open,
  interfaceLanguage,
  stats,
  onNavigate,
  utilityNav,
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
      value: `${stats.newWordsToday} / ${stats.dailyNewLimit}`,
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
      className={`${open ? "flex" : "hidden"} h-screen h-[100dvh] flex-col overflow-hidden bg-background-light text-slate-900 dark:bg-background-dark dark:text-slate-100`}
    >
      <header className="relative z-20 grid flex-none grid-cols-[1fr_auto_1fr] items-center border-b border-slate-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur md:px-6 md:py-3 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="min-w-0 justify-self-start">
          <BrandLogo />
        </div>
        <div className="hidden justify-self-center sm:block">
          <AppDestinationNav
            active="statistics"
            interfaceLanguage={interfaceLanguage}
            onNavigate={onNavigate}
          />
        </div>
        {open ? (
          <AppUtilityNav
            interfaceLanguage={interfaceLanguage}
            {...utilityNav}
          />
        ) : (
          <div />
        )}
      </header>

      <main className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8">
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
              onClick={() => onNavigate("training")}
              className="min-h-11 rounded-xl border border-indigo-500 bg-indigo-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-500"
            >
              {text.start}
            </button>
          </div>

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
      </main>
    </section>
  );
}
