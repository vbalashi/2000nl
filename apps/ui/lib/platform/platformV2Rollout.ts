export function platformV2LookupEnabled() {
  const value = process.env.PLATFORM_V2_LOOKUP_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export function platformV2ActionsEnabled() {
  const value = process.env.PLATFORM_V2_ACTIONS_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export function platformV2TrainingUiEnabled() {
  const value = process.env.NEXT_PUBLIC_PLATFORM_V2_TRAINING_UI
    ?.trim()
    .toLowerCase();
  return value === "1" || value === "true";
}

export function platformV2LibraryUiEnabled() {
  const value = process.env.NEXT_PUBLIC_PLATFORM_V2_LIBRARY_UI
    ?.trim()
    .toLowerCase();
  return value === "1" || value === "true";
}

function envFlagEnabled(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function rolloutProfileDiagnostics() {
  const profile = process.env.NEXT_PUBLIC_APP_ROLLOUT_PROFILE ?? "legacy";
  const flags = {
    platformV2Lookup: platformV2LookupEnabled(),
    platformV2Actions: platformV2ActionsEnabled(),
    platformV2TrainingUi: platformV2TrainingUiEnabled(),
    platformV2LibraryUi: platformV2LibraryUiEnabled(),
    navigationShellV1: envFlagEnabled(
      process.env.NEXT_PUBLIC_NAVIGATION_SHELL_V1,
    ),
    settingsStatisticsDestinationsV1: envFlagEnabled(
      process.env.NEXT_PUBLIC_SETTINGS_STATISTICS_DESTINATIONS_V1,
    ),
    trainingTodaySetupV1: envFlagEnabled(
      process.env.NEXT_PUBLIC_TRAINING_TODAY_SETUP_V1,
    ),
  };

  return {
    profile,
    flags,
    approvedPilot: profile === "pilot" && Object.values(flags).every(Boolean),
  };
}
