"use client";
import React from "react";
import { EyeOff } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { senseCardQuietActionClassName } from "../SenseCardChrome";
export const trainingExclusionCopy = {
  en: {
    label: "Exclude",
    help: "Exclude this pair from training in both directions",
    done: "Pair excluded from training",
    undo: "Undo",
    failed: "Could not complete the action. Try again.",
    dismiss: "Dismiss",
  },
  nl: {
    label: "Uitsluiten",
    help: "Sluit dit paar in beide richtingen uit van training",
    done: "Paar uitgesloten van training",
    undo: "Ongedaan maken",
    failed: "De actie is niet gelukt. Probeer opnieuw.",
    dismiss: "Sluiten",
  },
  ru: {
    label: "Исключить",
    help: "Исключить эту пару из тренировок в обоих направлениях",
    done: "Пара исключена из тренировок",
    undo: "Отменить",
    failed: "Не удалось выполнить действие. Повторите попытку.",
    dismiss: "Закрыть",
  },
};
export function TrainingExcludeAction({
  language,
  disabled,
  onClick,
}: {
  language: OnboardingLanguage;
  disabled: boolean;
  onClick: () => void;
}) {
  const t = trainingExclusionCopy[language];
  return (
    <button
      type="button"
      className={`${senseCardQuietActionClassName} min-w-0`}
      disabled={disabled}
      onClick={onClick}
      title={t.help}
      aria-label={t.help}
    >
      <EyeOff size={16} className="shrink-0" aria-hidden="true" />
      <span className="break-words">{t.label}</span>
    </button>
  );
}
