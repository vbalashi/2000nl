"use client";

import React from "react";
import { Monitor, Moon, Settings, Sun } from "lucide-react";
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
  disabled?: boolean;
  onCycleTheme: () => void;
  onOpenSettings: () => void;
};

function UtilityButton({
  label,
  current = false,
  onClick,
  children,
  tour,
  disabled = false,
}: {
  label: string;
  current?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tour?: string;
  disabled?: boolean;
}) {
  return (
    <Tooltip content={label} side="bottom" showOnFocus={false}>
      <button
        type="button"
        aria-label={label}
        aria-current={current ? "page" : undefined}
        aria-pressed={current}
        disabled={disabled}
        data-tour={tour}
        onClick={onClick}
        className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-slate-600 outline-none hover:bg-slate-400/10 focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#BFC7D4] md:h-10 md:w-10"
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
  disabled = false,
  onCycleTheme,
  onOpenSettings,
}: AppUtilityNavProps) {
  const text = copy[interfaceLanguage];
  const themeLabel = `${text.theme}: ${text[themePreference]}`;
  const ThemeIcon = { light: Sun, dark: Moon, system: Monitor }[themePreference];

  return (
    <div className="flex items-center gap-1 justify-self-end text-sm text-slate-500 md:gap-2 dark:text-slate-300">
      <UtilityButton
        label={themeLabel}
        onClick={onCycleTheme}
        disabled={disabled}
      >
        <ThemeIcon
          aria-hidden="true"
          className="h-[18px] w-[18px]"
          strokeWidth={1.5}
        />
      </UtilityButton>
      <UtilityButton
        label={text.settings}
        current={settingsActive}
        onClick={onOpenSettings}
        disabled={disabled}
        tour="settings-button"
      >
        <Settings
          aria-hidden="true"
          className="h-[18px] w-[18px]"
          strokeWidth={1.5}
        />
      </UtilityButton>
    </div>
  );
}
