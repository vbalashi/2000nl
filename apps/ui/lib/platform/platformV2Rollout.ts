export function platformV2LookupEnabled() {
  const value = process.env.PLATFORM_V2_LOOKUP_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export function platformV2ActionsEnabled() {
  const value = process.env.PLATFORM_V2_ACTIONS_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export function platformV2IdiomExercisesEnabled() {
  const value = process.env.PLATFORM_V2_IDIOM_EXERCISES_ENABLED
    ?.trim()
    .toLowerCase();
  return value === "1" || value === "true";
}

export function platformV2TranslationExercisesEnabled() {
  const value = process.env.PLATFORM_V2_TRANSLATION_EXERCISES_ENABLED
    ?.trim()
    .toLowerCase();
  return value === "1" || value === "true";
}

export function platformV2TrainingUiEnabled() {
  const value = process.env.NEXT_PUBLIC_PLATFORM_V2_TRAINING_UI
    ?.trim()
    .toLowerCase();
  return value === "1" || value === "true";
}

function envFlagEnabled(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function rolloutProfileDiagnostics() {
  const profile = process.env.NEXT_PUBLIC_APP_ROLLOUT_PROFILE ?? "pilot";
  const flags = {
    platformV2Lookup: platformV2LookupEnabled(),
    platformV2Actions: platformV2ActionsEnabled(),
    platformV2IdiomExercises: platformV2IdiomExercisesEnabled(),
    platformV2TranslationExercises: platformV2TranslationExercisesEnabled(),
    platformV2TrainingUi: platformV2TrainingUiEnabled(),
    trainingTodaySetupV1: envFlagEnabled(
      process.env.NEXT_PUBLIC_TRAINING_TODAY_SETUP_V1,
    ),
  };

  return {
    profile,
    flags,
    approvedPilot:
      profile === "pilot" &&
      [
        flags.platformV2Lookup,
        flags.platformV2Actions,
        flags.platformV2IdiomExercises,
        flags.platformV2TrainingUi,
        flags.trainingTodaySetupV1,
      ].every(Boolean),
  };
}
