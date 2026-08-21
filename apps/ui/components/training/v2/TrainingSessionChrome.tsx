"use client";

import React from "react";
import { History, X } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingMode } from "@/lib/types";
import { trainingScenarioLabel } from "./trainingSessionLabels";
import type { TrainingSessionProgress } from "./useTrainingSessionPresentation";

const copy = {
  nl: { close: "Sessie sluiten", history: "Geschiedenis", eyebrow: "TRAINING" },
  en: { close: "Close session", history: "History", eyebrow: "TRAINING" },
  ru: { close: "Закрыть сессию", history: "История", eyebrow: "ТРЕНИРОВКА" },
} satisfies Record<OnboardingLanguage, { close: string; history: string; eyebrow: string }>;

const modeCopy = {
  nl: {
    "word-to-definition": "woord → betekenis",
    "definition-to-word": "betekenis → woord",
    "listen-recognize": "luisteren → herkennen",
    "listen-type": "luisteren → typen",
  },
  en: {
    "word-to-definition": "word → meaning",
    "definition-to-word": "meaning → word",
    "listen-recognize": "listen → recognize",
    "listen-type": "listen → type",
  },
  ru: {
    "word-to-definition": "слово → значение",
    "definition-to-word": "значение → слово",
    "listen-recognize": "аудирование → узнавание",
    "listen-type": "аудирование → ввод",
  },
} satisfies Record<OnboardingLanguage, Record<TrainingMode, string>>;

export function TrainingSessionAppHeader({ interfaceLanguage, onHistory, historyButtonRef, onClose }: {
  interfaceLanguage: OnboardingLanguage;
  onHistory?: () => void;
  historyButtonRef?: React.Ref<HTMLButtonElement>;
  onClose: () => void;
}) {
  const text = copy[interfaceLanguage];
  return (
    <header data-testid="training-session-app-header" data-visual-spec="training-v1.0" className="flex h-[58px] w-full shrink-0 items-center justify-between border-b border-[#293249] bg-[#111827] px-[18px] font-sense-sans">
      <BrandLogo className="text-[26px] font-normal leading-none tracking-tight text-[#F3F5F9]" accentClassName="text-[#AAB0FF]" />
      <div className="flex items-center gap-[7px]">
        {onHistory ? (
          <button ref={historyButtonRef} type="button" aria-label={text.history} onClick={onHistory} className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-[#30394B] bg-[#171D29] text-[#B4BDCC] outline-none transition hover:border-[#7B8491] hover:text-white focus-visible:ring-2 focus-visible:ring-[#8B89F6]">
            <History aria-hidden="true" className="h-[15px] w-[15px]" />
          </button>
        ) : null}
        <button type="button" aria-label={text.close} onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-[#30394B] bg-[#171D29] text-[#B4BDCC] outline-none transition hover:border-[#7B8491] hover:text-white focus-visible:ring-2 focus-visible:ring-[#8B89F6]">
          <X aria-hidden="true" className="h-[15px] w-[15px]" />
        </button>
      </div>
    </header>
  );
}

export function TrainingSessionChrome({ interfaceLanguage, scenario, mode, position, progress }: {
  interfaceLanguage: OnboardingLanguage;
  scenario: string;
  mode: TrainingMode;
  position: number;
  progress: TrainingSessionProgress | null;
}) {
  const text = copy[interfaceLanguage];
  const shownPosition = progress?.position ?? position;
  return (
    <section data-testid="training-session-chrome" data-visual-spec="training-v1.0" className="mx-auto flex w-full max-w-[760px] shrink-0 flex-col gap-[14px] px-[10px] pt-[10px] font-sense-sans max-[480px]:px-0 md:px-0">
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[1.4px] text-[#AAB0FF]">{text.eyebrow}</span>
          <span className="truncate text-[16px] font-bold leading-tight text-slate-900 dark:text-[#F3F5F9]">
            {trainingScenarioLabel(interfaceLanguage, scenario)} · {modeCopy[interfaceLanguage][mode]}
          </span>
        </div>
        <span data-testid="training-session-position" className="shrink-0 rounded-full border border-slate-300 bg-white px-[9px] py-1.5 font-mono text-[11px] font-semibold tabular-nums text-slate-900 dark:border-[#30394B] dark:bg-[#171D29] dark:text-[#F3F5F9]">
          {shownPosition}
          {progress ? <span className="font-normal text-slate-500 dark:text-[#858F9F]"> / {progress.total}</span> : null}
        </span>
      </div>
      {progress ? (
        <div data-testid="training-session-progress-track" className="h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-[#232A38]">
          <div className="h-full rounded-full bg-[#8B89F6] transition-[width] motion-reduce:transition-none" style={{ width: `${progress.fraction * 100}%` }} />
        </div>
      ) : null}
    </section>
  );
}
