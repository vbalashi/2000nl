"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { AppDestination } from "./appDestination";

const labels: Record<
  OnboardingLanguage,
  Record<Exclude<AppDestination, "settings">, string>
> = {
  nl: {
    training: "Training",
    library: "Bibliotheek",
    statistics: "Statistieken",
  },
  en: { training: "Training", library: "Library", statistics: "Statistics" },
  ru: {
    training: "Тренировка",
    library: "Библиотека",
    statistics: "Статистика",
  },
};

type Props = {
  active: Exclude<AppDestination, "settings"> | null;
  interfaceLanguage: OnboardingLanguage;
  disabled?: boolean;
  extendedDestinationsEnabled?: boolean;
  onNavigate: (destination: AppDestination) => void;
};

export function AppDestinationNav({
  active,
  interfaceLanguage,
  disabled = false,
  extendedDestinationsEnabled = true,
  onNavigate,
}: Props) {
  const destinations: Array<Exclude<AppDestination, "settings">> =
    extendedDestinationsEnabled
      ? ["training", "library", "statistics"]
      : ["training", "library"];

  return (
    <nav
      aria-label="Primary"
      className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-sm dark:border-slate-700 dark:bg-slate-800/80"
    >
      {destinations.map((destination) => (
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
