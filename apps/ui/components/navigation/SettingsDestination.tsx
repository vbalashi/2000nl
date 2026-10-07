"use client";

import React from "react";
import { ApprovedSettingsDestination } from "./ApprovedSettingsDestination";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { ThemePreference } from "@/lib/training/useTrainingPreferences";

export type SettingsDestinationProps = {
  onExit: () => void;
  open: boolean;
  interfaceLanguage: OnboardingLanguage;
  themePreference: ThemePreference;
  translationLanguage: string | null;
  onThemeChange: (theme: ThemePreference) => void;
  onInterfaceLanguageChange: (
    language: OnboardingLanguage,
  ) => void | Promise<void>;
  onTranslationLanguageChange: (language: string | null) => void;
  userEmail: string;
  onSignOut: () => void | Promise<void>;
};

export function SettingsDestination(props: SettingsDestinationProps) {
  return <ApprovedSettingsDestination {...props} />;
}
