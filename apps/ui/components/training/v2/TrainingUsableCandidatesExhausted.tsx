"use client";

import React from "react";
import { TrainingCompletion } from "./TrainingCompletion";
import { trainingPresentationV1Enabled } from "@/lib/platform/platformV2Rollout";
import { getUiMessages } from "@/lib/uiMessages";
import { TrainingSessionState } from "./TrainingSessionState";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";

type Props = {
  interfaceLanguage: OnboardingLanguage;
  ownerId?: string; sessionId?: string | null;
  onExit: () => void;
  completedCount?: number;
  plannedTotal?: number | null;
  pending?: boolean;
  startFailed?: boolean;
  onRestart?: () => void;
  onEdit?: () => void;
};

export function TrainingUsableCandidatesExhausted({
  interfaceLanguage, ownerId, sessionId,
  onExit,
  completedCount = 0,
  plannedTotal = 0,
  pending = false, startFailed=false,
  onRestart,
  onEdit,
}: Props) {
  const completed = Boolean(plannedTotal && completedCount >= plannedTotal);
  const copy = {
    en: { completed: "Session complete", count: `${completedCount} cards completed`, next: "Start next session", edit: "Edit training" },
    nl: { completed: "Sessie voltooid", count: `${completedCount} kaarten voltooid`, next: "Volgende sessie starten", edit: "Training aanpassen" },
    ru: { completed: "Сессия завершена", count: `Пройдено карточек: ${completedCount}`, next: "Начать следующую сессию", edit: "Изменить тренировку" },
  }[interfaceLanguage];
  if (trainingPresentationV1Enabled() && completed) return <div className="h-full min-h-0" data-testid="training-usable-candidates-exhausted" data-training-v2-state="completed"><TrainingCompletion ownerId={ownerId} sessionId={sessionId} interfaceLanguage={interfaceLanguage} completedCount={completedCount} onExit={onExit} onRestart={onRestart} onEdit={onEdit} pending={pending} startFailed={startFailed} /></div>;
  if (trainingPresentationV1Enabled()) return (
    <div className="h-full min-h-0" data-testid="training-usable-candidates-exhausted" data-training-renderer="v2" data-training-v2-state={completed ? "completed" : "exhausted"}>
      <TrainingSessionState
        title={completed ? copy.completed : platformV2Message(interfaceLanguage, "senseCard.training.exhausted")}
        detail={completed ? copy.count : undefined}
        announcement="status"
        action={completed && onRestart ? { label: copy.next, onClick: onRestart, disabled: pending } : {label: getUiMessages(interfaceLanguage).trainingSession.back, onClick: onExit, disabled: pending}}
        secondaryAction={onEdit ? {label: copy.edit, onClick: onEdit, disabled: pending} : undefined}
        tertiaryAction={completed && onRestart ? {label: getUiMessages(interfaceLanguage).trainingSession.back, onClick: onExit, disabled: pending} : undefined}
      />
    </div>
  );
  return (
    <div
      data-testid="training-usable-candidates-exhausted"
      className="flex h-full min-h-[360px] items-center justify-center rounded-3xl border border-amber-200 bg-amber-50 px-6 py-10 text-center shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30"
    >
      <div className="max-w-md">
        <p
          role="status"
          className="text-base font-semibold text-amber-950 dark:text-amber-100"
        >
          {platformV2Message(
            interfaceLanguage,
            "senseCard.training.exhausted",
          )}
        </p>
        <button
          type="button"
          onClick={onExit}
          className="mt-6 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"
        >
          {platformV2Message(interfaceLanguage, "senseCard.training.exit")}
        </button>
      </div>
    </div>
  );
}
