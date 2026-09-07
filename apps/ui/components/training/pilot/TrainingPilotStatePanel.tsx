"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

type SharedProps = {
  interfaceLanguage: OnboardingLanguage;
  context: "bootstrap" | "training";
  copyVisible?: boolean;
};

type Props =
  | (SharedProps & { status: "preparing" | "loading" | "long-running" })
  | (SharedProps & { status: "error"; onRetry: () => void })
  | (SharedProps & {
      status: "empty" | "first-use";
      onSetUp: () => void;
    });

const copy = {
  en: {
    loading: "Loading card",
    bootstrapLoading: "Preparing training",
    longRunning: "Still loading your card",
    bootstrapLongRunning: "Still preparing your training",
    longRunningBody: "This is taking a little longer than expected.",
    empty: "No cards match this setup",
    emptyBody: "Adjust the selection without losing your current session.",
    trainingError: "Training could not be loaded",
    trainingErrorBody: "Try again; your current session and setup stay intact.",
    bootstrapError: "Your session could not be checked",
    bootstrapErrorBody: "We could not check your session. Try again.",
    firstUse: "Create your first training",
    firstUseBody: "Start with a safe default and adjust only what you need.",
    retry: "Try again",
    adjustFilters: "Adjust filters",
    setUp: "Set up training",
  },
  nl: {
    loading: "Kaart laden",
    bootstrapLoading: "Training voorbereiden",
    longRunning: "Je kaart wordt nog geladen",
    bootstrapLongRunning: "Training wordt nog voorbereid",
    longRunningBody: "Dit duurt iets langer dan verwacht.",
    empty: "Geen kaarten voor deze selectie",
    emptyBody: "Pas de selectie aan zonder je huidige sessie te verliezen.",
    trainingError: "Training kon niet worden geladen",
    trainingErrorBody:
      "Probeer opnieuw; je huidige sessie en selectie blijven bewaard.",
    bootstrapError: "Sessie kon niet worden gecontroleerd",
    bootstrapErrorBody:
      "We konden je sessie niet controleren. Probeer het opnieuw.",
    firstUse: "Maak je eerste training",
    firstUseBody: "Begin veilig en pas alleen aan wat je nodig hebt.",
    retry: "Opnieuw proberen",
    adjustFilters: "Filters aanpassen",
    setUp: "Training samenstellen",
  },
  ru: {
    loading: "Загружаем карточку",
    bootstrapLoading: "Подготавливаем тренировку",
    longRunning: "Карточка всё ещё загружается",
    bootstrapLongRunning: "Тренировка всё ещё подготавливается",
    longRunningBody: "Это занимает немного больше времени, чем ожидалось.",
    empty: "Для этих настроек нет карточек",
    emptyBody: "Измените выбор, не теряя текущую сессию.",
    trainingError: "Не удалось загрузить тренировку",
    trainingErrorBody:
      "Попробуйте ещё раз — текущая сессия и настройки сохранятся.",
    bootstrapError: "Не удалось проверить сеанс",
    bootstrapErrorBody: "Не удалось проверить ваш сеанс. Попробуйте снова.",
    firstUse: "Создайте первую тренировку",
    firstUseBody:
      "Начните с безопасного варианта и меняйте только необходимое.",
    retry: "Попробовать снова",
    adjustFilters: "Настроить фильтры",
    setUp: "Настроить тренировку",
  },
} satisfies Record<OnboardingLanguage, Record<string, string>>;

const actionClass =
  "min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400";

export function TrainingPilotStatePanel(props: Props) {
  const t = copy[props.interfaceLanguage];
  const stateCopy = (() => {
    switch (props.status) {
      case "preparing":
        return {
          heading: t.bootstrapLoading,
          body: null,
          action: null,
        };
      case "loading":
        return {
          heading:
            props.context === "bootstrap" ? t.bootstrapLoading : t.loading,
          body: null,
          action: null,
        };
      case "long-running":
        return {
          heading:
            props.context === "bootstrap"
              ? t.bootstrapLongRunning
              : t.longRunning,
          body: t.longRunningBody,
          action: null,
        };
      case "empty":
        return { heading: t.empty, body: t.emptyBody, action: t.adjustFilters };
      case "first-use":
        return { heading: t.firstUse, body: t.firstUseBody, action: t.setUp };
      case "error":
        return props.context === "bootstrap"
          ? {
              heading: t.bootstrapError,
              body: t.bootstrapErrorBody,
              action: t.retry,
            }
          : {
              heading: t.trainingError,
              body: t.trainingErrorBody,
              action: t.retry,
            };
    }
  })();
  const busy =
    props.status === "preparing" ||
    props.status === "loading" ||
    props.status === "long-running";
  const copyVisible = props.copyVisible ?? true;
  const onAction =
    props.status === "error"
      ? props.onRetry
      : props.status === "empty" || props.status === "first-use"
        ? props.onSetUp
        : undefined;

  return (
    <main className="flex min-h-0 flex-1 items-center justify-center px-4 py-10 md:px-8">
      <section
        role={props.status === "error" ? "alert" : "status"}
        data-context={props.context}
        aria-busy={busy}
        aria-label={copyVisible ? undefined : stateCopy.heading}
        aria-live="polite"
        className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/60 md:p-12"
      >
        {busy ? (
          <div
            data-testid="training-loading-indicator"
            aria-hidden="true"
            className="mx-auto mb-6 h-1.5 w-28 overflow-hidden rounded-full bg-indigo-500/15"
          >
            <div className="h-full w-1/2 rounded-full bg-indigo-500/70 motion-safe:animate-pulse motion-reduce:opacity-70" />
          </div>
        ) : (
          <div
            aria-hidden="true"
            className={`mx-auto mb-5 h-3 w-3 rounded-full ${
              props.status === "error" ? "bg-red-500/70" : "bg-indigo-500/70"
            }`}
          />
        )}
        {copyVisible ? (
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">
            {stateCopy.heading}
          </h1>
        ) : null}
        {copyVisible && stateCopy.body ? (
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">
            {stateCopy.body}
          </p>
        ) : null}
        {copyVisible && stateCopy.action ? (
          <button
            type="button"
            onClick={onAction}
            className={`${actionClass} mt-8 w-full border-indigo-500 bg-indigo-500/20 text-indigo-900 dark:text-indigo-100`}
          >
            {stateCopy.action}
          </button>
        ) : null}
      </section>
    </main>
  );
}
