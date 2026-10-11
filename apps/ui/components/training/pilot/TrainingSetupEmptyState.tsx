"use client";

import React from "react";
import styles from "./trainingStatePanel.module.css";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

const copy = {
  en: { empty: "No cards match this setup", emptyBody: "Adjust the selection without losing your current session.", firstUse: "Create your first training", firstUseBody: "Start with a safe default and adjust only what you need.", adjustFilters: "Adjust filters", setUp: "Set up training" },
  nl: { empty: "Geen kaarten voor deze selectie", emptyBody: "Pas de selectie aan zonder je huidige sessie te verliezen.", firstUse: "Maak je eerste training", firstUseBody: "Begin veilig en pas alleen aan wat je nodig hebt.", adjustFilters: "Filters aanpassen", setUp: "Training samenstellen" },
  ru: { empty: "Для этих настроек нет карточек", emptyBody: "Измените выбор, не теряя текущую сессию.", firstUse: "Создайте первую тренировку", firstUseBody: "Начните с безопасного варианта и меняйте только необходимое.", adjustFilters: "Настроить фильтры", setUp: "Настроить тренировку" },
} satisfies Record<OnboardingLanguage, Record<string, string>>;

/** Empty/setup states cannot render the retired startup loading/error panel. */
export function TrainingSetupEmptyState({ interfaceLanguage, status, onSetUp }: {
  interfaceLanguage: OnboardingLanguage;
  status: "empty" | "first-use";
  onSetUp: () => void;
}) {
  const t = copy[interfaceLanguage];
  const empty = status === "empty";
  return <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-10 md:px-8">
    <section role="status" data-context="training" aria-busy="false" aria-live="polite" className={styles.panel}>
      <h1 className={styles.heading}>{empty ? t.empty : t.firstUse}</h1>
      <p className={styles.body}>{empty ? t.emptyBody : t.firstUseBody}</p>
      <button type="button" onClick={onSetUp} className={styles.action}>{empty ? t.adjustFilters : t.setUp}</button>
    </section>
  </div>;
}
