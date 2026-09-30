import type { OnboardingLanguage } from "@/lib/onboardingI18n";
const displayNames = new Map<OnboardingLanguage, Intl.DisplayNames>();
/** Interface labels never become persistence identifiers. */
export function languageDisplayName(
  locale: OnboardingLanguage,
  code: string,
  fallback = code,
) {
  try {
    let names = displayNames.get(locale);
    if (!names) {
      names = new Intl.DisplayNames([locale], {
        type: "language",
        fallback: "none",
      });
      displayNames.set(locale, names);
    }
    return names.of(code) ?? fallback;
  } catch {
    return fallback;
  }
}
