import { localizedSection, formatMessage } from "@/lib/i18n/catalog";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
const texts = localizedSection("independentEntryCopy");
export const independentEntryCopyText = (language: OnboardingLanguage) => {
  const text = texts[language];
  return { ...text, title: (word: string) => formatMessage(text.title, {word}) };
};
