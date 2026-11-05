import { getInterfaceCatalog, formatMessage, formatPluralMessage } from "@/lib/i18n/catalog";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

export function getUiMessages(language: OnboardingLanguage) {
  return getInterfaceCatalog(language).ui;
}

export const formatUiMessage = formatMessage;

export function formatExerciseCount(language: OnboardingLanguage, count: number): string {
  return formatUiCount(language, count, getUiMessages(language).trainingOverview, "exercise");
}

export function formatMeaningAvailability(language: OnboardingLanguage, count: number): string {
  return formatUiCount(language, count, getUiMessages(language).builder, "meaning");
}

/** Count nouns use the interface locale, independently of dictionary content. */
export function formatUiCount<Prefix extends string>(
  language: OnboardingLanguage,
  count: number,
  messages: Record<`${Prefix}${"Zero" | "One" | "Two" | "Few" | "Many" | "Other"}`, string>,
  prefix: Prefix,
): string {
  return formatPluralMessage(language, count, {
    zero: messages[`${prefix}Zero`], one: messages[`${prefix}One`],
    two: messages[`${prefix}Two`], few: messages[`${prefix}Few`],
    many: messages[`${prefix}Many`], other: messages[`${prefix}Other`],
  });
}

/** Normalize display names without changing dictionary POS identity. */
export function getPartOfSpeechLabel(language:OnboardingLanguage,part:string|null):string|null {
 const aliases:Record<string,string>={noun:"zn",verb:"ww",adjective:"bn",adverb:"bw",preposition:"vz",pronoun:"vnw",numeral:"tw",article:"lidw",interjection:"tsw",conjunction:"vw",abbreviation:"afk",prefix:"vv"};
 const catalog=getInterfaceCatalog(language).partOfSpeech;
 const key=aliases[part??""]??part;
 return key&&key in catalog?catalog[key as keyof typeof catalog]:part;
}
