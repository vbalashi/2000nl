export type OnboardingLanguage = "en" | "ru" | "nl";

export type OnboardingTranslation = {
  onboarding: {
    steps: Array<{
      title: string;
      content: string;
    }>;
    buttons: {
      back: string;
      close: string;
      last: string;
      next: string;
      skip: string;
    };
    languageSelection: {
      title: string;
      subtitle: string;
      english: string;
      russian: string;
      dutch: string;
    };
  };
};

const ONBOARDING_LANG_KEY = "onboarding_language";

// Import translations statically for bundling
import en from "@/locales/en.json";
import ru from "@/locales/ru.json";
import nl from "@/locales/nl.json";

const translations: Record<OnboardingLanguage, OnboardingTranslation> = {
  en: en as OnboardingTranslation,
  ru: ru as OnboardingTranslation,
  nl: nl as OnboardingTranslation,
};

export function getOnboardingLanguage(): OnboardingLanguage {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem(ONBOARDING_LANG_KEY);
    if (saved === "en" || saved === "ru" || saved === "nl") {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return "en"; // Default to English
}

export function setOnboardingLanguage(lang: OnboardingLanguage): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_LANG_KEY, lang);
  } catch {
    // Ignore storage errors
  }
}

export function getOnboardingTranslation(
  lang: OnboardingLanguage
): OnboardingTranslation {
  return translations[lang];
}
