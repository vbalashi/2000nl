"use client";

import React from "react";
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
    <div
      role="alert"
      data-testid="training-v2-unsupported-mode"
      data-training-renderer="v2"
      data-training-v2-state="unsupported-mode"
      className="mx-auto grid h-full min-h-0 w-full max-w-[760px] flex-1 place-items-center rounded-[14px] border border-slate-300 bg-slate-50 px-[18px] py-10 text-center font-sense-sans text-slate-900 shadow-sm dark:border-[#4B5360] dark:bg-[#20252D] dark:text-[#F4F6FA] dark:shadow-none"
    >
      <div className="flex max-w-sm -translate-y-[6px] flex-col items-center gap-[18px]">
        <p className="text-[18px] font-bold leading-tight">
          {platformV2Message(
            interfaceLanguage,
            "senseCard.training.unsupportedMode",
          )}
        </p>
        <button
          type="button"
          onClick={onExit}
          className="h-[42px] rounded-xl px-3 text-[14px] font-bold text-slate-600 outline-none hover:bg-slate-200/60 focus-visible:ring-2 focus-visible:ring-[#8B89F6] dark:text-[#F4F6FA] dark:hover:bg-[#262B34]"
        >
          {platformV2Message(interfaceLanguage, "senseCard.training.exit")}
        </button>
      </div>
    </div>
  );
}
