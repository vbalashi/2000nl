import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingSessionPresentationSnapshot } from "./useTrainingSessionPresentation";
import styles from "./TrainingSessionLayout.module.css";

const labels = { en: "Session progress", nl: "Sessievoortgang", ru: "Прогресс сессии" };

/** Session-owned overlay: deliberately outside the moving/turning card surface. */
export function TrainingSessionProgressRim({ presentation, language }: {
  presentation: TrainingSessionPresentationSnapshot;
  language: OnboardingLanguage;
}) {
  if (presentation.kind !== "planned") return null;
  const fraction = Math.max(0, Math.min(1, presentation.fraction));
  return <div className={styles.progressRim} data-testid="training-session-progress-track"
    role="progressbar" aria-label={labels[language]} aria-valuemin={0}
    aria-valuemax={presentation.total} aria-valuenow={Math.min(presentation.position, presentation.total)}>
    <div className={styles.progressRimFill} style={{ width: `${fraction * 100}%` }} />
  </div>;
}
