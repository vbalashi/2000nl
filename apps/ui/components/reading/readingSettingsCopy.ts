import { localizedSection } from "@/lib/i18n/catalog";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

export const readingSettingsCopy = localizedSection("readingSettings") satisfies Record<OnboardingLanguage, Record<string, string>>;
