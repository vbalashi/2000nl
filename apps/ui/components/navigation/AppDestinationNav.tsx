"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { AppDestination } from "./appDestination";

const labels: Record<
  OnboardingLanguage,
  Record<AppDestination, string>
> = {
  nl: { training: "Training", library: "Bibliotheek" },
  en: { training: "Training", library: "Library" },
  ru: { training: "Тренировка", library: "Библиотека" },
};

type Props = {
  active: AppDestination;
  interfaceLanguage: OnboardingLanguage;
  disabled?: boolean;
  onNavigate: (destination: AppDestination) => void;
};

export function AppDestinationNav({
  active,
  interfaceLanguage,
  disabled = false,
  onNavigate,
}: Props) {
  return (
    <nav aria-label="Primary" className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-sm dark:border-slate-700 dark:bg-slate-800/80">
      {(["training", "library"] as const).map((destination) => (
        <button
          key={destination}
          type="button"
          disabled={disabled}
          aria-current={active === destination ? "page" : undefined}
          onClick={() => onNavigate(destination)}
          className={`min-h-9 rounded-lg px-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
            active === destination
              ? "bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          }`}
        >
          {labels[interfaceLanguage][destination]}
        </button>
      ))}
    </nav>
  );
}
