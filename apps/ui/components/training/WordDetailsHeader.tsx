import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";

export function WordDetailsHeader({ onClose, interfaceLanguage }: {
  onClose: () => void;
  interfaceLanguage: OnboardingLanguage;
}) {
  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
      <span className="min-w-0 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
        {platformV2Message(interfaceLanguage, "senseCard.wordDetails.open")}
      </span>
      <button
        type="button"
        aria-label={platformV2Message(interfaceLanguage, "common.close")}
        onClick={onClose}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xl text-slate-600 dark:border-slate-600 dark:bg-slate-900/90 dark:text-slate-200"
      >
        ×
      </button>
    </header>
  );
}
