"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

type SharedProps = {
  interfaceLanguage: OnboardingLanguage;
  context: "bootstrap" | "training";
};

type Props =
  | (SharedProps & { status: "loading" | "long-running" })
  | (SharedProps & { status: "error"; onRetry: () => void })
  | (SharedProps & {
      status: "empty" | "first-use";
      onSetUp: () => void;
    });

const copy = {
  en: {
    loading: "Loading Training",
    loadingBody: "Your navigation stays available while the session loads.",
    bootstrapLoadingBody: "We’re checking your session before Training opens.",
    longRunningBody: "This is taking longer than usual. We’re still trying.",
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
    loading: "Training laden",
    loadingBody: "De navigatie blijft beschikbaar terwijl je sessie laadt.",
    bootstrapLoadingBody: "We controleren je sessie voordat Training opent.",
    longRunningBody: "Dit duurt langer dan normaal. We blijven proberen.",
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
    loading: "Загрузка тренировки",
    loadingBody: "Навигация остаётся доступной, пока загружается сессия.",
    bootstrapLoadingBody: "Проверяем ваш сеанс перед открытием тренировки.",
    longRunningBody:
      "Это занимает больше времени, чем обычно. Мы продолжаем попытки.",
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
      case "loading":
        return {
          heading: t.loading,
          body:
            props.context === "bootstrap"
              ? t.bootstrapLoadingBody
              : t.loadingBody,
          action: null,
        };
      case "long-running":
        return { heading: t.loading, body: t.longRunningBody, action: null };
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
  const busy = props.status === "loading" || props.status === "long-running";
  const onAction =
    props.status === "error"
      ? props.onRetry
      : props.status === "empty" || props.status === "first-use"
        ? props.onSetUp
        : undefined;

  return (
    <main className="flex min-h-0 flex-1 items-center justify-center px-4 py-10 md:px-8">
      <section
        aria-busy={busy}
        aria-live="polite"
        className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/60 md:p-12"
      >
        <div
          aria-hidden="true"
          className={`mx-auto mb-5 h-12 w-12 rounded-2xl border ${
            props.status === "error"
              ? "border-red-400/60 bg-red-500/10"
              : "border-indigo-400/60 bg-indigo-500/10"
          }`}
        />
        <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">
          {stateCopy.heading}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">
          {stateCopy.body}
        </p>
        {stateCopy.action ? (
          <button
            type="button"
            onClick={onAction}
            className={`${actionClass} mt-8 w-full border-indigo-500 bg-indigo-500/20 text-indigo-900 dark:text-indigo-100`}
          >
            {stateCopy.action}
          </button>
        ) : (
          <p aria-hidden="true" className="mt-8 text-sm font-semibold text-indigo-500">
            …
          </p>
        )}
      </section>
    </main>
  );
}
