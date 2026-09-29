import en from "@/locales/en.json";
import nl from "@/locales/nl.json";
import ru from "@/locales/ru.json";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

type UiMessages = typeof en.ui;

// UI copy shares the existing locale catalogs. The shape is checked at build time.
const catalogs: Record<OnboardingLanguage, UiMessages> = {
  en: en.ui,
  nl: nl.ui,
  ru: ru.ui,
};

export function getUiMessages(language: OnboardingLanguage): UiMessages {
  return catalogs[language];
}

export function formatUiMessage(
  template: string,
  variables: Record<string, string | number>,
): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_, key: string) =>
    String(variables[key] ?? `{${key}}`),
  );
}

export function formatExerciseCount(
  language: OnboardingLanguage,
  count: number,
): string {
  const copy = getUiMessages(language).trainingOverview;
  const category = new Intl.PluralRules(language).select(count);
  const template = {
    one: copy.exerciseOne,
    few: copy.exerciseFew,
    many: copy.exerciseMany,
    other: copy.exerciseOther,
    zero: copy.exerciseOther,
    two: copy.exerciseOther,
  }[category];
  return formatUiMessage(template, { count });
}
