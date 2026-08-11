"use client";

import React from "react";
import { Settings, SunMoon } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { ThemePreference } from "@/lib/training/useTrainingPreferences";

const copy = {
  nl: {
    theme: "Thema",
    light: "Licht",
    dark: "Donker",
    system: "Systeem",
    settings: "Instellingen",
  },
  en: {
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    settings: "Settings",
  },
  ru: {
    theme: "Тема",
    light: "Светлая",
    dark: "Тёмная",
    system: "Системная",
    settings: "Настройки",
  },
} satisfies Record<OnboardingLanguage, Record<string, string>>;

export type AppUtilityNavProps = {
  interfaceLanguage: OnboardingLanguage;
  themePreference: ThemePreference;
  settingsActive?: boolean;
  onCycleTheme: () => void;
  onOpenSettings: () => void;
};

function UtilityButton({
  label,
  current = false,
  onClick,
  children,
  tour,
}: {
  label: string;
  current?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tour?: string;
}) {
  return (
    <Tooltip content={label} side="bottom" showOnFocus={false}>
      <button
        type="button"
        aria-label={label}
        aria-current={current ? "page" : undefined}
        aria-pressed={current}
        data-tour={tour}
        onClick={onClick}
        className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-sm transition md:h-10 md:w-10 ${
          current
            ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-200 dark:ring-indigo-900"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function AppUtilityNav({
  interfaceLanguage,
  themePreference,
  settingsActive = false,
  onCycleTheme,
  onOpenSettings,
}: AppUtilityNavProps) {
  const text = copy[interfaceLanguage];
  const themeLabel = `${text.theme}: ${text[themePreference]}`;

  return (
    <div className="flex items-center gap-1 justify-self-end text-sm text-slate-500 md:gap-2 dark:text-slate-300">
      <UtilityButton label={themeLabel} onClick={onCycleTheme}>
        <SunMoon aria-hidden="true" className="h-5 w-5" />
      </UtilityButton>
      <UtilityButton
        label={text.settings}
        current={settingsActive}
        onClick={onOpenSettings}
        tour="settings-button"
      >
        <Settings aria-hidden="true" className="h-5 w-5" />
      </UtilityButton>
    </div>
  );
}
