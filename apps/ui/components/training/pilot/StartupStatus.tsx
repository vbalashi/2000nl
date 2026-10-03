"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { StartupLogoScreen } from "./StartupLogoScreen";

const copy: Record<OnboardingLanguage, string> = {
  en: "Preparing training",
  nl: "Training voorbereiden",
  ru: "Подготавливаем тренировку",
};

/** One waiting surface across auth, account presentation and training hydration. */
export function StartupStatus({ language = "en", copyVisible = true }: {
  language?: OnboardingLanguage;
  copyVisible?: boolean;
}) {
  return <StartupLogoScreen>
    <section role="status" aria-busy="true" data-context="bootstrap"
      aria-label={copyVisible ? undefined : copy[language]}>
      <h1 style={{ visibility: copyVisible ? undefined : "hidden" }}>{copy[language]}</h1>
    </section>
  </StartupLogoScreen>;
}
