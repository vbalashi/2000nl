import { getInterfaceCatalog } from "@/lib/i18n/catalog";
import { defaultInterfaceLanguage, isInterfaceLanguage, matchInterfaceLanguage, type InterfaceLanguage } from "@/lib/i18n/registry";

/** Legacy name retained for callers and saved preferences. */
export type OnboardingLanguage = InterfaceLanguage;
export const isOnboardingLanguage = isInterfaceLanguage;

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
export const INTERFACE_LANGUAGE_EVENT = "2000nl:interface-language";

export function getStoredOnboardingLanguage(): InterfaceLanguage | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(ONBOARDING_LANG_KEY);
    return isInterfaceLanguage(saved) ? saved : null;
  } catch { return null; }
}
export function getOnboardingLanguage(): InterfaceLanguage {
  return getStoredOnboardingLanguage() ?? defaultInterfaceLanguage;
}

/** Detect from browser preferences only; learning and translation choices are independent. */
export function detectOnboardingLanguage(_translationLang?: string | null): InterfaceLanguage {
  if (typeof window === "undefined") return defaultInterfaceLanguage;
  try {
    for (const locale of navigator.languages?.length ? navigator.languages : [navigator.language]) {
      const language = matchInterfaceLanguage(locale);
      if (language) return language;
    }
  } catch { /* Use the default if browser preferences are unavailable. */ }
  return defaultInterfaceLanguage;
}

export function setOnboardingLanguage(lang: InterfaceLanguage): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(ONBOARDING_LANG_KEY, lang); } catch { /* The in-memory choice still applies. */ }
  window.dispatchEvent(new CustomEvent(INTERFACE_LANGUAGE_EVENT, { detail: lang }));
}
export function getOnboardingTranslation(lang: InterfaceLanguage): OnboardingTranslation {
  return getInterfaceCatalog(lang);
}
