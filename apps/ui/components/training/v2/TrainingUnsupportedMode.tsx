"use client";

import React from "react";
import { getUiMessages } from "@/lib/uiMessages";
import { TrainingSessionState } from "./TrainingSessionState";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";

export function TrainingUnsupportedMode({
  interfaceLanguage,
  onExit,
}: {
  interfaceLanguage: OnboardingLanguage;
  onExit: () => void;
}) {
  return (
    <div className="h-full min-h-0" data-testid="training-v2-unsupported-mode" data-training-renderer="v2" data-training-v2-state="unsupported-mode">
      <TrainingSessionState title={platformV2Message(interfaceLanguage, "senseCard.training.unsupportedMode")}
        announcement="alert" action={{label: getUiMessages(interfaceLanguage).trainingSession.back, onClick: onExit}} />
    </div>
  );
}
