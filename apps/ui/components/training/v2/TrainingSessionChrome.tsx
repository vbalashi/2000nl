"use client";

import React from "react";
import { History, X } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { CardFilter, TrainingMode } from "@/lib/types";
import { trainingSessionLabel } from "./trainingSessionLabels";
import type { TrainingSessionPresentationSnapshot } from "./useTrainingSessionPresentation";
import styles from "./TrainingSessionLayout.module.css";

const copy = {
  nl: { close: "Sessie sluiten", history: "Geschiedenis" },
  en: { close: "Close session", history: "History" },
  ru: { close: "Закрыть сессию", history: "История" },
} satisfies Record<OnboardingLanguage, { close: string; history: string }>;

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
}: {
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
}) {
  const text = copy[interfaceLanguage];
  const name =
    sessionName ??
    trainingSessionLabel(interfaceLanguage, scenario, mode, cardFilter);
  return (
    <section
      data-testid="training-session-chrome"
      data-visual-spec="training-height-b"
      className={`${styles.session} font-sense-sans`}
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
      {presentation.kind === "planned" ? (
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
}
