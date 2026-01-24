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

// Auto-detect onboarding language from system/user preferences
export function detectOnboardingLanguage(
  translationLang?: string | null
): OnboardingLanguage {
  if (typeof window === "undefined") return "en";

  // 1. Try translation language setting
  if (translationLang === "ru" || translationLang === "nl") {
    return translationLang;
  }

  // 2. Try system language
  try {
    const systemLang = navigator.language.toLowerCase();
    if (systemLang.startsWith("ru")) return "ru";
    if (systemLang.startsWith("nl")) return "nl";
  } catch {
    // Ignore errors
  }

  // 3. Fall back to English
  return "en";
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
