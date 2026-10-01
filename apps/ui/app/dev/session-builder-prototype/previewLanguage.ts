import {catalogCodeFromName} from "@/lib/languages/languageCatalog";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";

/** Preview names remain stable values; ISO codes only drive their presentation. */
export function previewLanguageCode(name: string): string | undefined {
  return catalogCodeFromName(name);
}

export function previewLanguageName(locale: OnboardingLanguage, name: string): string {
  const code = previewLanguageCode(name);
  if (!code) return name;
  const display = new Intl.DisplayNames(locale, {type: "language", fallback: "none"}).of(code);
  return display ?? name;
}
