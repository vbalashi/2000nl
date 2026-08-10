"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingMode } from "@/lib/types";
import { trainingScenarioLabel } from "./trainingSessionLabels";

const copy = {
  nl: {
    close: "Sessie sluiten",
    history: "Geschiedenis",
    card: "Kaart",
    openSession: "open sessie",
    modes: {
      "word-to-definition": "woord → betekenis",
      "definition-to-word": "betekenis → woord",
      "listen-recognize": "luisteren → herkennen",
      "listen-type": "luisteren → typen",
    },
  },
  en: {
    close: "Close session",
    history: "History",
    card: "Card",
    openSession: "open session",
    modes: {
      "word-to-definition": "word → meaning",
      "definition-to-word": "meaning → word",
      "listen-recognize": "listen → recognize",
      "listen-type": "listen → type",
    },
  },
  ru: {
    close: "Закрыть сессию",
    history: "История",
    card: "Карточка",
    openSession: "открытая сессия",
    modes: {
      "word-to-definition": "слово → значение",
      "definition-to-word": "значение → слово",
      "listen-recognize": "аудирование → узнавание",
      "listen-type": "аудирование → ввод",
    },
  },
} satisfies Record<
  OnboardingLanguage,
  {
    close: string;
    history: string;
    card: string;
    openSession: string;
    modes: Record<TrainingMode, string>;
  }
>;

export function TrainingSessionChrome({
  interfaceLanguage,
  scenario,
  mode,
  position,
  onClose,
}: {
  interfaceLanguage: OnboardingLanguage;
  scenario: string;
  mode: TrainingMode;
  position: number;
  onClose: () => void;
}) {
  const text = copy[interfaceLanguage];
  const scenarioLabel = trainingScenarioLabel(interfaceLanguage, scenario);
  return (
    <div
      data-testid="training-session-chrome"
      className="mx-auto flex w-full max-w-[960px] shrink-0 items-center gap-3 px-3 pt-2 md:px-0"
    >
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-slate-300/70 bg-white/75 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/65 dark:text-slate-400">
        <span className="min-w-0 truncate">
          {scenarioLabel} · {text.modes[mode]}
        </span>
        <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">
          {text.card} {position} · {text.openSession}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={text.close}
          className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-base leading-none text-slate-500 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:hover:border-slate-500 dark:hover:text-white sm:flex"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function TrainingSessionMobileUtilities({
  interfaceLanguage,
  historyActive,
  onOpenHistory,
  onClose,
}: {
  interfaceLanguage: OnboardingLanguage;
  historyActive: boolean;
  onOpenHistory: () => void;
  onClose: () => void;
}) {
  const text = copy[interfaceLanguage];
  const buttonClass =
    "flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800";
  return (
    <div className="flex items-center gap-1.5 md:hidden">
      <button
        type="button"
        aria-label={text.history}
        aria-pressed={historyActive}
        onClick={onOpenHistory}
        className={buttonClass}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 8v4l3 2" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={text.close}
        onClick={onClose}
        className={buttonClass}
      >
        <span aria-hidden="true" className="text-xl leading-none">
          ×
        </span>
      </button>
    </div>
  );
}
