import { localizedSection } from "@/lib/i18n/catalog";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

export function releaseCopy(language: OnboardingLanguage) {
  return localizedSection("releases")[language];
}
