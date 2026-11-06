import { localizedSection, formatMessage } from "@/lib/i18n/catalog";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

const copy = localizedSection("authorEntryArchive");
export function authorEntryArchiveCopy(language: OnboardingLanguage) {
  const text = copy[language];
  return { ...text, title: (word: string) => formatMessage(text.title, {word}) };
}
