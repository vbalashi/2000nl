"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";

type Props = {
  interfaceLanguage: OnboardingLanguage;
  onExit: () => void;
};

export function TrainingUsableCandidatesExhausted({
  interfaceLanguage,
  onExit,
}: Props) {
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
