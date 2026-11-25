import { getInterfaceCatalog } from "@/lib/i18n/catalog";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

export function personalCardCopy(language: OnboardingLanguage) {
  return getInterfaceCatalog(language).features.personalCard;
}
export type PersonalCardCopy = ReturnType<typeof personalCardCopy>;
