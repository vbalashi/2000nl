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
    const label = names.of(code) ?? fallback;
    return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
  } catch {
    return fallback;
  }
}

/** A language autonym is dictionary/locale identity, independent of UI language. */
export function languageAutonym(code: string): string {
  try {
    const label = new Intl.DisplayNames([code], {type:"language",fallback:"none"}).of(code) ?? code;
    return label.charAt(0).toLocaleUpperCase(code) + label.slice(1);
  } catch { return code; }
}
