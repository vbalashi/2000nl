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

export function formatMeaningAvailability(language: OnboardingLanguage, count: number): string {
  const copy = getUiMessages(language).builder;
  const category = new Intl.PluralRules(language).select(count);
  const template = category === "one" ? copy.meaningOne : category === "few" ? copy.meaningFew : category === "many" ? copy.meaningMany : copy.meaningOther;
  return formatUiMessage(template, { count: new Intl.NumberFormat(language).format(count) });
}

/** Count nouns use the interface locale, independently of dictionary content. */
export function formatUiCount<Prefix extends string>(
  language: OnboardingLanguage,
  count: number,
  messages: Record<`${Prefix}${"One" | "Few" | "Many" | "Other"}`, string>,
  prefix: Prefix,
): string {
  const category = new Intl.PluralRules(language).select(count);
  const suffix = category === "one" ? "One" : category === "few" ? "Few" : category === "many" ? "Many" : "Other";
  const template = messages[`${prefix}${suffix}`];
  if (typeof template !== "string") throw new Error(`Missing count message: ${prefix}${suffix}`);
  return formatUiMessage(template, { count: new Intl.NumberFormat(language).format(count) });
}

/** Normalize display names without changing dictionary POS identity. */
export function getPartOfSpeechLabel(language:OnboardingLanguage,part:string|null):string|null {
 const aliases:Record<string,string>={noun:"zn",verb:"ww",adjective:"bn",adverb:"bw",preposition:"vz",pronoun:"vnw",numeral:"tw",article:"lidw",interjection:"tsw",conjunction:"vw",abbreviation:"afk",prefix:"vv"};
 const catalog={en:en.partOfSpeech,nl:nl.partOfSpeech,ru:ru.partOfSpeech}[language];
 const key=aliases[part??""]??part;
 return key&&key in catalog?catalog[key as keyof typeof catalog]:part;
}
