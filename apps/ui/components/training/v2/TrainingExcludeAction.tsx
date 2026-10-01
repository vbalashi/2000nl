"use client";
import React from "react";
import { getUiMessages } from "@/lib/uiMessages";
import { EyeOff } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { senseCardQuietAction } from "../SenseCardChrome";
/** Compatibility adapter; exclusion and undo copy has one catalog owner. */
export const trainingExclusionCopy = {
  en: getUiMessages("en").trainingSession.exclusion,
  nl: getUiMessages("nl").trainingSession.exclusion,
  ru: getUiMessages("ru").trainingSession.exclusion,
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
      className={`${senseCardQuietAction()} min-w-0`}
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
