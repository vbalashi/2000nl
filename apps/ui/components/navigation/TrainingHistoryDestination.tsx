"use client";

import React from "react";
import { BrandLogo } from "@/components/BrandLogo";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import {
  fetchRecentTrainingHistory,
  type RecentTrainingHistoryItem,
} from "@/lib/training/trainingHistoryService";
import { AppDestinationNav, MobileAppDestinationNav } from "./AppDestinationNav";
import { AppUtilityNav, type AppUtilityNavProps } from "./AppUtilityNav";
import type { AppDestination } from "./appDestination";

const copy = {
  nl: {
    title: "Geschiedenis",
    eyebrow: "Training",
    subtitle: "Trainingsactiviteit uit de afgelopen 24 uur.",
    back: "Terug naar training",
    loading: "Geschiedenis laden…",
    empty: "Nog geen trainingsactiviteit in de afgelopen 24 uur.",
    error: "Geschiedenis kon niet worden geladen.",
    retry: "Opnieuw proberen",
    list: "Recente trainingsactiviteit",
    events: {
      review_fail: "Opnieuw",
      review_hard: "Moeilijk",
      review_success: "Goed",
      review_easy: "Makkelijk",
      definition_click: "Definitie bekeken",
      freeze: "Bevroren",
      hide: "Verborgen",
      other: "Activiteit",
    },
    modes: {
      "word-to-definition": "Woord → betekenis",
      "definition-to-word": "Betekenis → woord",
      "listen-recognize": "Luisteren → herkennen",
      "listen-type": "Luisteren → typen",
      other: "Training",
    },
  },
  en: {
    title: "History",
    eyebrow: "Training",
    subtitle: "Training activity from the last 24 hours.",
    back: "Back to training",
    loading: "Loading history…",
    empty: "No training activity in the last 24 hours.",
    error: "History could not be loaded.",
    retry: "Try again",
    list: "Recent training activity",
    events: {
      review_fail: "Again",
      review_hard: "Hard",
      review_success: "Good",
      review_easy: "Easy",
      definition_click: "Definition viewed",
      freeze: "Frozen",
      hide: "Hidden",
      other: "Activity",
    },
    modes: {
      "word-to-definition": "Word → meaning",
      "definition-to-word": "Meaning → word",
      "listen-recognize": "Listen → recognize",
      "listen-type": "Listen → type",
      other: "Training",
    },
  },
  ru: {
    title: "История",
    eyebrow: "Тренировка",
    subtitle: "Действия в тренировке за последние 24 часа.",
    back: "Вернуться к тренировке",
    loading: "Загрузка истории…",
    empty: "За последние 24 часа действий в тренировке не было.",
    error: "Не удалось загрузить историю.",
    retry: "Попробовать снова",
    list: "Недавние действия в тренировке",
    events: {
      review_fail: "Снова",
      review_hard: "Трудно",
      review_success: "Хорошо",
      review_easy: "Легко",
      definition_click: "Просмотрено определение",
      freeze: "Заморожено",
      hide: "Скрыто",
      other: "Действие",
    },
    modes: {
      "word-to-definition": "Слово → значение",
      "definition-to-word": "Значение → слово",
      "listen-recognize": "Слушать → узнать",
      "listen-type": "Слушать → ввести",
      other: "Тренировка",
    },
  },
} as const;

const localeByLanguage: Record<OnboardingLanguage, string> = {
  nl: "nl-NL",
  en: "en-GB",
  ru: "ru-RU",
};

const formatTime = (language: OnboardingLanguage, value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeByLanguage[language], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

type LoadState =
  | { status: "idle" | "loading"; items: RecentTrainingHistoryItem[] }
  | { status: "ready"; items: RecentTrainingHistoryItem[] }
  | { status: "error"; items: RecentTrainingHistoryItem[] };

type Props = {
  open: boolean;
  userId: string;
  interfaceLanguage: OnboardingLanguage;
  onNavigate: (destination: AppDestination) => void;
  utilityNav: Omit<AppUtilityNavProps, "interfaceLanguage">;
};

export function TrainingHistoryDestination({
  open,
  userId,
  interfaceLanguage,
  onNavigate,
  utilityNav,
}: Props) {
  const text = copy[interfaceLanguage];
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const [loadState, setLoadState] = React.useState<LoadState>({
    status: "idle",
    items: [],
  });
  const [requestVersion, setRequestVersion] = React.useState(0);

  React.useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadState((current) => ({ status: "loading", items: current.items }));
    void fetchRecentTrainingHistory(userId)
      .then((items) => {
        if (!cancelled) setLoadState({ status: "ready", items });
      })
      .catch(() => {
        if (!cancelled) setLoadState({ status: "error", items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, requestVersion, userId]);

  return (
    <section
      aria-hidden={!open}
      aria-busy={open && loadState.status === "loading"}
      className={`${open ? "flex" : "hidden"} h-screen h-[100dvh] flex-col overflow-hidden bg-background-light text-slate-900 dark:bg-background-dark dark:text-slate-100`}
    >
      <header className="relative z-20 grid flex-none grid-cols-[1fr_auto_1fr] items-center border-b border-slate-200 bg-white/90 px-3 py-2.5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 md:px-6 md:py-3">
        <div className="min-w-0 justify-self-start">
          <BrandLogo />
        </div>
        <div className="justify-self-center">
          <AppDestinationNav
            active={null}
            interfaceLanguage={interfaceLanguage}
            onNavigate={onNavigate}
          />
        </div>
        {open ? (
          <AppUtilityNav interfaceLanguage={interfaceLanguage} {...utilityNav} />
        ) : (
          <div />
        )}
      </header>

      <main className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                {text.eyebrow}
              </p>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="mt-1 text-3xl font-bold text-slate-950 outline-none dark:text-white"
              >
                {text.title}
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {text.subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("training")}
              className="min-h-11 rounded-xl border border-indigo-500 bg-indigo-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
            >
              {text.back}
            </button>
          </div>

          <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            {loadState.status === "loading" && loadState.items.length === 0 ? (
              <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
                {text.loading}
              </p>
            ) : null}
            {loadState.status === "error" ? (
              <div role="alert" className="flex flex-col items-start gap-3">
                <p className="text-sm text-red-700 dark:text-red-300">{text.error}</p>
                <button
                  type="button"
                  onClick={() => setRequestVersion((version) => version + 1)}
                  className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  {text.retry}
                </button>
              </div>
            ) : null}
            {loadState.status === "ready" && loadState.items.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{text.empty}</p>
            ) : null}
            {loadState.items.length > 0 ? (
              <ol aria-label={text.list} className="divide-y divide-slate-100 dark:divide-slate-800">
                {loadState.items.map((item) => {
                  const eventLabel =
                    text.events[item.eventType as keyof typeof text.events] ??
                    text.events.other;
                  const modeLabel =
                    text.modes[item.mode as keyof typeof text.modes] ?? text.modes.other;
                  return (
                    <li
                      key={`${item.entryId}-${item.createdAt}-${item.eventType}`}
                      className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="font-semibold text-slate-950 dark:text-white">
                            {item.headword}
                          </span>
                          {item.partOfSpeech ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {item.partOfSpeech}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {modeLabel}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {eventLabel}
                        </p>
                        <time
                          dateTime={item.createdAt}
                          className="mt-1 block text-xs tabular-nums text-slate-500 dark:text-slate-400"
                        >
                          {formatTime(interfaceLanguage, item.createdAt)}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </section>
        </div>
      </main>
      <MobileAppDestinationNav
        active={null}
        interfaceLanguage={interfaceLanguage}
        onNavigate={onNavigate}
      />
    </section>
  );
}
