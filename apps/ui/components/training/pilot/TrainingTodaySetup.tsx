"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type {
  CardFilter,
  DetailedStats,
  TrainingDateWindow,
  TrainingMode,
} from "@/lib/types";
import { TrainingPilotStatePanel } from "./TrainingPilotStatePanel";

export type TrainingPilotStatus =
  "ready" | "loading" | "empty" | "error" | "first-use";

export type TrainingSetupDraft = {
  scenarioId: string;
  modes: TrainingMode[];
  cardFilter: CardFilter;
  listValue: string;
  newReviewRatio: number;
  dateWindow: TrainingDateWindow;
  daysAgo?: number;
  sourceValue: string;
};

export type TrainingSetupOption = {
  value: string;
  label: string;
  modes?: TrainingMode[];
};

export const isTrainingSetupDraftSupported = (
  draft: Pick<TrainingSetupDraft, "scenarioId" | "modes">,
  scenarios: TrainingSetupOption[],
) => {
  const scenario = scenarios.find(
    (option) => option.value === draft.scenarioId,
  );
  return Boolean(
    scenario?.modes?.length &&
    draft.modes.length > 0 &&
    draft.modes.every((mode) => scenario.modes?.includes(mode)),
  );
};

const defaultModesForScenario = (scenario: TrainingSetupOption) => {
  const modes = scenario.modes ?? [];
  if (
    scenario.value === "understanding" &&
    modes.includes("word-to-definition")
  ) {
    return ["word-to-definition"] satisfies TrainingMode[];
  }
  return modes;
};

type Props = {
  interfaceLanguage: OnboardingLanguage;
  status: TrainingPilotStatus;
  initialDraft: TrainingSetupDraft;
  stats: DetailedStats;
  scenarios: TrainingSetupOption[];
  lists: TrainingSetupOption[];
  sources: TrainingSetupOption[];
  startPending?: boolean;
  scenarioLoading?: boolean;
  activeSessionLabel?: string;
  onContinue: () => void;
  onStart: (
    draft: TrainingSetupDraft,
  ) => boolean | void | Promise<boolean | void>;
  onRetry: () => void;
};

const copy = {
  en: {
    eyebrowToday: "TRAINING · TODAY",
    greeting: "Good morning",
    completed: (count: number) => `${count} cards completed today`,
    queueSummary: (reviews: number, introduced: number, limit: number) =>
      `${reviews} reviews due · ${introduced}/${limit} new today`,
    active: "ACTIVE SESSION",
    activeFallback: "Current training",
    continue: "Continue session",
    quick: "Quick start",
    adjust: "Adjust training",
    startCurrent: "Start current setup",
    setupEyebrow: "TRAINING · SETUP",
    setupHeading: "Build your session",
    back: "Back to Today",
    selection: "Selection",
    goal: "Training goal",
    meaning: "Meaning",
    reverse: "Reverse",
    listening: "Listening",
    soon: "Soon",
    mix: "Session mix",
    new: "New",
    review: "Reviews",
    both: "Both",
    list: "Word list",
    source: "Source",
    date: "Time window",
    allDates: "All time",
    today: "Today",
    yesterday: "Yesterday",
    allSources: "All sources",
    youtube: "YouTube",
    start: "Start training",
    starting: "Starting…",
    ratio: "New / review rhythm",
    ratioOption: (value: number) => `1 new · ${value} review`,
    sessionSize: "Session size",
    allMatching: "All matching cards",
    daysAgo: "Days ago",
    loading: "Loading Training",
    chooseGoal: "Choose a training goal",
  },
  nl: {
    eyebrowToday: "TRAINING · VANDAAG",
    greeting: "Goedemorgen",
    completed: (count: number) => `${count} kaarten vandaag afgerond`,
    queueSummary: (reviews: number, introduced: number, limit: number) =>
      `${reviews} herhalingen klaar · ${introduced}/${limit} nieuw vandaag`,
    active: "ACTIEVE SESSIE",
    activeFallback: "Huidige training",
    continue: "Sessie doorgaan",
    quick: "Snel starten",
    adjust: "Training aanpassen",
    startCurrent: "Huidige selectie starten",
    setupEyebrow: "TRAINING · INSTELLEN",
    setupHeading: "Stel je sessie samen",
    back: "Terug naar Vandaag",
    selection: "Selectie",
    goal: "Trainingsdoel",
    meaning: "Betekenis",
    reverse: "Omgekeerd",
    listening: "Luisteren",
    soon: "Binnenkort",
    mix: "Sessiemix",
    new: "Nieuw",
    review: "Herhaling",
    both: "Beide",
    list: "Woordenlijst",
    source: "Bron",
    date: "Periode",
    allDates: "Alle tijd",
    today: "Vandaag",
    yesterday: "Gisteren",
    allSources: "Alle bronnen",
    youtube: "YouTube",
    start: "Training starten",
    starting: "Starten…",
    ratio: "Ritme nieuw / herhaling",
    ratioOption: (value: number) => `1 nieuw · ${value} herhaling`,
    sessionSize: "Sessiegrootte",
    allMatching: "Alle passende kaarten",
    daysAgo: "Dagen geleden",
    loading: "Training laden",
    chooseGoal: "Kies een trainingsdoel",
  },
  ru: {
    eyebrowToday: "ТРЕНИРОВКА · СЕГОДНЯ",
    greeting: "Доброе утро",
    completed: (count: number) => `Сегодня завершено карточек: ${count}`,
    queueSummary: (reviews: number, introduced: number, limit: number) =>
      `Повторений к выполнению: ${reviews} · новых сегодня: ${introduced}/${limit}`,
    active: "АКТИВНАЯ СЕССИЯ",
    activeFallback: "Текущая тренировка",
    continue: "Продолжить сессию",
    quick: "Быстрый старт",
    adjust: "Настроить тренировку",
    startCurrent: "Начать с текущими настройками",
    setupEyebrow: "ТРЕНИРОВКА · НАСТРОЙКА",
    setupHeading: "Соберите сессию",
    back: "Назад к экрану Сегодня",
    selection: "Выбор",
    goal: "Цель тренировки",
    meaning: "Значение",
    reverse: "Обратные",
    listening: "Аудирование",
    soon: "Скоро",
    mix: "Состав сессии",
    new: "Новые",
    review: "Повторения",
    both: "Оба",
    list: "Список слов",
    source: "Источник",
    date: "Период",
    allDates: "За всё время",
    today: "Сегодня",
    yesterday: "Вчера",
    allSources: "Все источники",
    youtube: "YouTube",
    start: "Начать тренировку",
    starting: "Запускаем…",
    ratio: "Ритм новых / повторений",
    ratioOption: (value: number) => `1 новая · ${value} повторений`,
    sessionSize: "Размер сессии",
    allMatching: "Все подходящие карточки",
    daysAgo: "Дней назад",
    loading: "Загрузка тренировки",
    chooseGoal: "Выберите цель тренировки",
  },
} satisfies Record<OnboardingLanguage, Record<string, unknown>>;

const actionClass =
  "min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400";

function ChoiceButton({
  active,
  label,
  onClick,
  disabled = false,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`${actionClass} flex-1 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-70 dark:disabled:border-slate-800 dark:disabled:bg-slate-900/40 dark:disabled:text-slate-600 ${
        active
          ? "border-indigo-500 bg-indigo-500/20 text-indigo-950 dark:text-indigo-100"
          : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-950/35 dark:text-slate-300"
      }`}
    >
      {label}
    </button>
  );
}

export function TrainingTodaySetup({
  interfaceLanguage,
  status,
  initialDraft,
  stats,
  scenarios,
  lists,
  sources,
  startPending = false,
  scenarioLoading = false,
  activeSessionLabel,
  onContinue,
  onStart,
  onRetry,
}: Props) {
  const t = copy[interfaceLanguage];
  const [screen, setScreen] = useState<"today" | "setup">("today");
  const [draft, setDraft] = useState(initialDraft);

  useEffect(() => {
    if (screen === "today") setDraft(initialDraft);
  }, [initialDraft, screen]);

  useEffect(() => {
    if (screen !== "setup" || scenarioLoading || scenarios.length === 0) return;
    const selectedScenario = scenarios.find(
      (option) => option.value === draft.scenarioId,
    );
    if (selectedScenario && isTrainingSetupDraftSupported(draft, scenarios))
      return;
    const nextScenario = selectedScenario ?? scenarios[0];
    setDraft((current) => ({
      ...current,
      scenarioId: nextScenario.value,
      modes: defaultModesForScenario(nextScenario),
    }));
  }, [draft, scenarioLoading, scenarios, screen]);

  const initialScenarioSupported = isTrainingSetupDraftSupported(
    initialDraft,
    scenarios,
  );
  const draftScenarioSupported = isTrainingSetupDraftSupported(
    draft,
    scenarios,
  );

  const completed = stats.newCardsToday + stats.reviewCardsDone;
  const selectedModeLabels = [
    draft.modes.includes("word-to-definition") ? t.meaning : null,
    draft.modes.includes("definition-to-word") ? t.reverse : null,
  ].filter(Boolean);
  const selectedList = lists.find(
    (option) => option.value === draft.listValue,
  )?.label;
  const selectionSummary = useMemo(
    () =>
      [
        draft.cardFilter === "both"
          ? t.both
          : draft.cardFilter === "new"
            ? t.new
            : t.review,
        selectedModeLabels.join(" + "),
        selectedList,
      ]
        .filter(Boolean)
        .join(" · "),
    [draft.cardFilter, selectedList, selectedModeLabels, t],
  );

  const openSetup = () => {
    setDraft(initialDraft);
    setScreen("setup");
  };

  const requestStart = async (nextDraft: TrainingSetupDraft) => {
    const started = await onStart(nextDraft);
    if (started === false) setScreen("today");
  };

  if (screen === "today" && status !== "ready") {
    return status === "error" ? (
      <TrainingPilotStatePanel
        interfaceLanguage={interfaceLanguage}
        status={status}
        context="training"
        onRetry={onRetry}
      />
    ) : status === "empty" || status === "first-use" ? (
      <TrainingPilotStatePanel
        interfaceLanguage={interfaceLanguage}
        status={status}
        context="training"
        onSetUp={openSetup}
      />
    ) : (
      <TrainingPilotStatePanel
        interfaceLanguage={interfaceLanguage}
        status="loading"
        context="training"
      />
    );
  }

  if (screen === "today") {
    return (
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-10">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <header>
            <p className="font-mono text-xs font-bold tracking-[0.22em] text-slate-500 dark:text-slate-400">
              {t.eyebrowToday}
            </p>
            <h1 className="mt-2 text-3xl font-medium text-slate-950 dark:text-white md:text-4xl">
              {t.greeting}
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {t.completed(completed)}
            </p>
          </header>

          <section className="rounded-3xl border border-indigo-500 bg-indigo-500/15 p-5 md:p-7">
            <p className="font-mono text-xs font-bold tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
              {t.active}
            </p>
            <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                  {activeSessionLabel || t.activeFallback}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {selectionSummary}
                </p>
              </div>
              <button
                type="button"
                onClick={onContinue}
                className={`${actionClass} shrink-0 border-indigo-500 bg-indigo-500 text-white hover:bg-indigo-400 dark:text-slate-950`}
              >
                {t.continue} <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/55 md:p-7">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                {t.quick}
              </h2>
              <button
                type="button"
                onClick={openSetup}
                className="min-h-10 text-sm font-semibold text-indigo-600 dark:text-indigo-300"
              >
                {t.adjust}
              </button>
            </div>
            <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <p className="font-semibold text-slate-950 dark:text-white">
                {selectionSummary}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t.queueSummary(
                  stats.reviewCardsDue,
                  stats.newWordsToday,
                  stats.dailyNewLimit,
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void requestStart(initialDraft)}
              disabled={
                startPending || scenarioLoading || !initialScenarioSupported
              }
              className={`${actionClass} mt-4 w-full border-indigo-500 bg-indigo-500/20 text-indigo-900 hover:bg-indigo-500/25 disabled:cursor-wait disabled:opacity-60 dark:text-indigo-100`}
            >
              {startPending
                ? t.starting
                : scenarioLoading
                  ? t.loading
                  : initialScenarioSupported
                    ? t.startCurrent
                    : t.chooseGoal}
            </button>
          </section>
        </div>
      </main>
    );
  }

  const understandingScenario = scenarios.find(
    (option) => option.value === "understanding",
  );
  const toggleMode = (mode: TrainingMode) => {
    if (!understandingScenario?.modes?.includes(mode)) return;
    setDraft((current) => {
      const active = current.modes.includes(mode);
      if (active && current.modes.length === 1) return current;
      return {
        ...current,
        scenarioId: understandingScenario.value,
        modes: active
          ? current.modes.filter((candidate) => candidate !== mode)
          : [...current.modes, mode],
      };
    });
  };
  const toggleSessionKind = (kind: "new" | "review") =>
    setDraft((current) => {
      if (kind === "new") {
        return {
          ...current,
          cardFilter:
            current.cardFilter === "both"
              ? "review"
              : current.cardFilter === "review"
                ? "both"
                : "new",
        };
      }
      return {
        ...current,
        cardFilter:
          current.cardFilter === "both"
            ? "new"
            : current.cardFilter === "new"
              ? "both"
              : "review",
      };
    });

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <button
          type="button"
          aria-label={t.back}
          onClick={() => setScreen("today")}
          className="min-h-10 text-sm font-semibold text-slate-600 dark:text-slate-300"
        >
          ← {t.back}
        </button>
        <p className="mt-4 font-mono text-xs font-bold tracking-[0.22em] text-slate-500 dark:text-slate-400">
          {t.setupEyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-medium text-slate-950 dark:text-white md:text-4xl">
          {t.setupHeading}
        </h1>

        <section className="mt-6 rounded-3xl border border-indigo-500 bg-indigo-500/15 p-5">
          <p className="font-mono text-xs font-bold tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
            {t.selection}
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">
            {selectionSummary}
          </p>
        </section>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <fieldset className="rounded-3xl border border-slate-200 bg-white/75 p-5 dark:border-slate-800 dark:bg-slate-900/55">
            <legend className="px-1 text-lg font-semibold text-slate-950 dark:text-white">
              {t.goal}
            </legend>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {scenarioLoading ? (
                <p
                  role="status"
                  className="text-sm text-slate-500 dark:text-slate-400"
                >
                  {t.loading}
                </p>
              ) : null}
              {understandingScenario?.modes?.includes("word-to-definition") ? (
                <ChoiceButton
                  active={draft.modes.includes("word-to-definition")}
                  label={t.meaning}
                  onClick={() => toggleMode("word-to-definition")}
                />
              ) : null}
              {understandingScenario?.modes?.includes("definition-to-word") ? (
                <ChoiceButton
                  active={draft.modes.includes("definition-to-word")}
                  label={t.reverse}
                  onClick={() => toggleMode("definition-to-word")}
                />
              ) : null}
              <ChoiceButton
                active={false}
                disabled
                label={t.listening}
                onClick={() => undefined}
              />
            </div>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              {t.listening} · {t.soon}
            </p>
          </fieldset>

          <fieldset className="rounded-3xl border border-slate-200 bg-white/75 p-5 dark:border-slate-800 dark:bg-slate-900/55">
            <legend className="px-1 text-lg font-semibold text-slate-950 dark:text-white">
              {t.mix}
            </legend>
            <div className="mt-3 flex gap-2">
              <ChoiceButton
                active={draft.cardFilter !== "review"}
                label={t.new}
                onClick={() => toggleSessionKind("new")}
              />
              <ChoiceButton
                active={draft.cardFilter !== "new"}
                label={t.review}
                onClick={() => toggleSessionKind("review")}
              />
            </div>
          </fieldset>

          <fieldset
            disabled={draft.cardFilter !== "both"}
            className="rounded-3xl border border-slate-200 bg-white/75 p-5 transition disabled:opacity-45 dark:border-slate-800 dark:bg-slate-900/55"
          >
            <legend className="px-1 text-lg font-semibold text-slate-950 dark:text-white">
              {t.ratio}
            </legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[1, 2, 3, 5].map((ratio) => (
                <ChoiceButton
                  key={ratio}
                  active={draft.newReviewRatio === ratio}
                  disabled={draft.cardFilter !== "both"}
                  label={t.ratioOption(ratio)}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      newReviewRatio: ratio,
                    }))
                  }
                />
              ))}
            </div>
          </fieldset>

          <label className="rounded-3xl border border-slate-200 bg-white/75 p-5 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900/55 dark:text-slate-200">
            {t.list}
            <select
              aria-label={t.list}
              value={draft.listValue}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  listValue: event.target.value,
                }))
              }
              className="mt-3 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
            >
              {lists.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="rounded-3xl border border-slate-200 bg-white/75 p-5 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900/55 dark:text-slate-200">
            {t.source}
            <select
              aria-label={t.source}
              value={draft.sourceValue}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  sourceValue: event.target.value,
                }))
              }
              className="mt-3 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="all">{t.allSources}</option>
              <option value="kind:youtube">{t.youtube}</option>
              {sources.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="rounded-3xl border border-slate-200 bg-white/75 p-5 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900/55 dark:text-slate-200 lg:col-span-2">
            {t.date}
            <select
              aria-label={t.date}
              value={draft.dateWindow}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dateWindow: event.target.value as TrainingDateWindow,
                }))
              }
              className="mt-3 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="all">{t.allDates}</option>
              <option value="today">{t.today}</option>
              <option value="yesterday">{t.yesterday}</option>
              <option value="daysAgo">{t.daysAgo}</option>
            </select>
            {draft.dateWindow === "daysAgo" ? (
              <input
                aria-label={t.daysAgo}
                type="number"
                min={0}
                max={365}
                value={draft.daysAgo ?? 7}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    daysAgo: Math.max(
                      0,
                      Math.min(365, Number(event.target.value) || 0),
                    ),
                  }))
                }
                className="mt-3 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
              />
            ) : null}
          </label>
        </div>

        <section className="mt-5 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white/75 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/55 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              {t.sessionSize}
            </p>
            <p className="mt-1 font-semibold text-slate-950 dark:text-white">
              {t.allMatching}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void requestStart(draft)}
            disabled={
              startPending || scenarioLoading || !draftScenarioSupported
            }
            className={`${actionClass} w-full border-indigo-500 bg-indigo-500 text-white hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-60 dark:text-slate-950 sm:w-auto sm:min-w-56`}
          >
            {startPending
              ? t.starting
              : scenarioLoading
                ? t.loading
                : draftScenarioSupported
                  ? t.start
                  : t.chooseGoal}
          </button>
        </section>
      </div>
    </main>
  );
}
