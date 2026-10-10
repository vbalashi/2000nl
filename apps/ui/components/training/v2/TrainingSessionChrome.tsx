"use client";

import React from "react";
import { History, X } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { CardFilter, TrainingMode } from "@/lib/types";
import { trainingSessionLabel } from "./trainingSessionLabels";
import type { TrainingSessionPresentationSnapshot } from "./useTrainingSessionPresentation";
import styles from "./TrainingSessionLayout.module.css";
import { TrainingSessionProgress } from "./TrainingSessionProgress";
import { useTrainingInteractions } from "@/components/practice/ui/TrainingInteractionPreferences";

const copy = {
  nl: { close: "Sessie sluiten", history: "Geschiedenis" },
  en: { close: "Close session", history: "History" },
  ru: { close: "Закрыть сессию", history: "История" },
} satisfies Record<OnboardingLanguage, { close: string; history: string }>;

export type TrainingSessionChromeProps = {
  interfaceLanguage: OnboardingLanguage;
  scenario: string;
  mode: TrainingMode;
  cardFilter: CardFilter;
  presentation: TrainingSessionPresentationSnapshot;
  sessionName?: string;
  onHistory?: () => void;
  historyButtonRef?: React.Ref<HTMLButtonElement>;
  onClose: () => void;
  disabled?: boolean;
  approvedPresentation?: boolean;
  /** Show progress only while the session is ready. */
  showProgress?: boolean;
};

export function TrainingSessionChrome({
  interfaceLanguage,
  scenario,
  mode,
  cardFilter,
  presentation,
  sessionName,
  onHistory,
  historyButtonRef,
  onClose,
  disabled = false,
  approvedPresentation = false,
  showProgress = false,
}: TrainingSessionChromeProps) {
  const text = copy[interfaceLanguage];
  const { preferences } = useTrainingInteractions();
  const name =
    sessionName ??
    trainingSessionLabel(interfaceLanguage, scenario, mode, cardFilter);
  const chrome = (
    <section
      data-testid="training-session-chrome"
      data-visual-spec={approvedPresentation ? "training-approved-v1" : "training-height-b"}
      className={`${styles.session} ${approvedPresentation ? styles.sessionApproved : ""} font-sense-sans`}
    >
      <span
        data-testid="training-session-name"
        className={styles.name}
        title={name}
      >
        {name}
      </span>
      <span data-testid="training-session-position" className={styles.position}>
        {presentation.position}
        {presentation.kind === "planned" ? ` / ${presentation.total}` : null}
      </span>
      <div className={styles.utilities}>
        {onHistory ? (
          <button
            ref={historyButtonRef}
            type="button"
            aria-label={text.history}
            disabled={disabled}
            onClick={onHistory}
          >
            <History aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={text.close}
          disabled={disabled}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      {presentation.kind === "planned" && !approvedPresentation ? (
        <div
          data-testid="training-session-progress-track"
          className={styles.progress}
        >
          <div
            className="transition-[width] motion-reduce:transition-none"
            style={{ width: `${presentation.fraction * 100}%` }}
          />
        </div>
      ) : null}
    </section>
  );
  if (!approvedPresentation) return chrome;
  return (
    <div className={styles.progressHeader}>
      {chrome}
      {showProgress && presentation.kind === "planned" && preferences.progressAnimation !== "off" ? (
        <TrainingSessionProgress
          presentation={presentation}
          language={interfaceLanguage}
          variant={preferences.progressAnimation}
        />
      ) : null}
    </div>
  );
}
