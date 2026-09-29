import catalog from "./languageCatalog.json";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";

const byName = new Map(catalog.map(language => [language.name, language.code]));
byName.set("Русский", "ru");

/** Preview names remain stable values; ISO codes only drive their presentation. */
export function previewLanguageCode(name: string): string | undefined {
  return byName.get(name);
}

export function previewLanguageName(locale: OnboardingLanguage, name: string): string {
  const code = previewLanguageCode(name);
  if (!code) return name;
  const display = new Intl.DisplayNames(locale, {type: "language", fallback: "none"}).of(code);
  return display ?? name;
}
