"use client";

import React from "react";
import { useReleaseUpdates } from "@/components/releases/AppReleaseContext";
import { ReleaseDot } from "@/components/releases/ReleaseUpdates";
import { releaseCopy } from "@/lib/releases/releaseCopy";
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
  description,
}: {
  label: string;
  description?: string;
  current?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tour?: string;
  disabled?: boolean;
}) {
  const descriptionId = React.useId();
  return (
    <Tooltip content={label} side="bottom" showOnFocus={false}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={description ? descriptionId : undefined}
        aria-current={current ? "page" : undefined}
        aria-pressed={current}
        disabled={disabled}
        data-tour={tour}
        onClick={onClick}
        className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-slate-600 outline-none hover:bg-slate-400/10 focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#BFC7D4] md:h-10 md:w-10"
      >
        {children}
        {description && <span id={descriptionId} className="sr-only">{description}</span>}
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
  const updates = useReleaseUpdates();
  const text = copy[interfaceLanguage];
  const themeLabel = `${text.theme}: ${text[themePreference]}`;
  const ThemeIcon = { light: Sun, dark: Moon, system: Monitor }[themePreference];

  return (
    <div className="flex items-center gap-1 justify-self-end text-sm text-slate-500 md:gap-2 dark:text-slate-300">
      <UtilityButton
        label={themeLabel}
        tour="theme-switch"
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
        description={updates?.attention ? releaseCopy(interfaceLanguage).unread : undefined}
        current={settingsActive}
        onClick={onOpenSettings}
        disabled={disabled}
        tour="settings-button"
      >
        {updates?.attention && <ReleaseDot gear />}
        <Settings
          aria-hidden="true"
          className="h-[18px] w-[18px]"
          strokeWidth={1.5}
        />
      </UtilityButton>
    </div>
  );
}
