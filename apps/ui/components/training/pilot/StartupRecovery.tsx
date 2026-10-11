"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { StartupLogoScreen } from "./StartupLogoScreen";

const copy = {
  en: { bootstrap: "Your session could not be checked", training: "Training could not be loaded", bootstrapBody: "We could not check your session. Try again.", body: "Try again; your current session and setup stay intact.", retry: "Try again" },
  nl: { bootstrap: "Sessie kon niet worden gecontroleerd", training: "Training kon niet worden geladen", bootstrapBody: "We konden je sessie niet controleren. Probeer het opnieuw.", body: "Probeer opnieuw; je huidige sessie en selectie blijven bewaard.", retry: "Opnieuw proberen" },
  ru: { bootstrap: "Не удалось проверить сеанс", training: "Не удалось загрузить тренировку", bootstrapBody: "Не удалось проверить ваш сеанс. Попробуйте снова.", body: "Попробуйте ещё раз — текущая сессия и настройки сохранятся.", retry: "Попробовать снова" },
} satisfies Record<OnboardingLanguage, Record<string, string>>;

/** A settled failure keeps recovery accessible on the same startup surface. */
export function StartupRecovery({ language, context = "bootstrap", onRetry }: {
  language: OnboardingLanguage;
  context?: "bootstrap" | "training";
  onRetry: () => void;
}) {
  const t = copy[language];
  return <StartupLogoScreen>
    <section role="alert" data-context={context}>
      <h1>{t[context]}</h1>
      <p>{context === "bootstrap" ? t.bootstrapBody : t.body}</p>
      <button type="button" onClick={onRetry}>{t.retry}</button>
    </section>
  </StartupLogoScreen>;
}
