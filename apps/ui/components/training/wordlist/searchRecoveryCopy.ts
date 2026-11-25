import { getInterfaceCatalog } from "@/lib/i18n/catalog";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

export function searchRecoveryCopy(language: OnboardingLanguage) {
  return getInterfaceCatalog(language).features.searchRecovery;
}
