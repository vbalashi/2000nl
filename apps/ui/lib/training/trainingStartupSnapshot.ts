import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { UserPreferences } from "@/lib/training/preferencesService";

/** One authenticated startup boundary shared by every Training consumer. */
export type TrainingStartupSnapshot = {
  transitionId: string;
  interfaceLanguage: OnboardingLanguage;
  preferences: UserPreferences;
};
