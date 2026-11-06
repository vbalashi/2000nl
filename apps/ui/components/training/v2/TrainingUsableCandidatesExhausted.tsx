"use client";
import { localizedSection, formatMessage } from "@/lib/i18n/catalog";

import React from "react";
import { TrainingCompletion } from "./TrainingCompletion";
import { getUiMessages } from "@/lib/uiMessages";
import { TrainingSessionState } from "./TrainingSessionState";
import type { TrainingSessionSize } from "@/lib/types";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";

type Props = {
  interfaceLanguage: OnboardingLanguage;
  ownerId?: string; sessionId?: string | null;
  onExit: () => void;
  completedCount?: number;
  plannedTotal?: number | null;
  sessionSize?: TrainingSessionSize;
  pending?: boolean;
  startFailed?: boolean;
  onRestart?: () => void;
  onEdit?: () => void;
};

export function TrainingUsableCandidatesExhausted({
  interfaceLanguage, ownerId, sessionId,
  onExit,
  completedCount = 0,
  plannedTotal = 0, sessionSize,
  pending = false, startFailed=false,
  onRestart,
  onEdit,
}: Props) {
  const completed = Boolean(plannedTotal && completedCount >= plannedTotal);
  const copy = localizedSection("trainingExhausted")[interfaceLanguage];
  if (completed) return <div className="h-full min-h-0" data-testid="training-usable-candidates-exhausted" data-training-v2-state="completed"><TrainingCompletion sessionSize={sessionSize} ownerId={ownerId} sessionId={sessionId} interfaceLanguage={interfaceLanguage} completedCount={completedCount} onExit={onExit} onRestart={onRestart} onEdit={onEdit} pending={pending} startFailed={startFailed} /></div>;
  return (
    <div className="h-full min-h-0" data-testid="training-usable-candidates-exhausted" data-training-renderer="v2" data-training-v2-state={completed ? "completed" : "exhausted"}>
      <TrainingSessionState
        title={completed ? copy.completed : platformV2Message(interfaceLanguage, "senseCard.training.exhausted")}
        detail={completed ? formatMessage(copy.count, {completedCount}) : undefined}
        announcement="status"
        action={completed && onRestart ? { label: copy.next, onClick: onRestart, disabled: pending } : {label: getUiMessages(interfaceLanguage).trainingSession.back, onClick: onExit, disabled: pending}}
        secondaryAction={onEdit ? {label: copy.edit, onClick: onEdit, disabled: pending} : undefined}
        tertiaryAction={completed && onRestart ? {label: getUiMessages(interfaceLanguage).trainingSession.back, onClick: onExit, disabled: pending} : undefined}
      />
    </div>
  );
}
