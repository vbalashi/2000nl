import crypto from "node:crypto";
import type { DictionaryMeaningTranslationResultV1 } from "../../lib/translation/dictionaryMeaningTranslationContract";
import type { EvalCase } from "./types";
export const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export function evaluateAlternatives(item: EvalCase, result: DictionaryMeaningTranslationResultV1) {
  const entry = result.entryTranslation;
  const texts = entry ? [entry.primaryText, ...entry.alternativeTexts] : [];
  const unexpected = texts.filter(text => !item.allowedStems.some(stem =>
    text.normalize("NFC").toLowerCase().includes(stem)));
  return {
    baseUnexpected: Boolean(entry?.baseText) && !item.baseAllowedStems.some(stem =>
      entry!.baseText!.normalize("NFC").toLowerCase().includes(stem)),
    hasPrimary: item.entryExpected === false ? entry === null : Boolean(entry?.primaryText),
    alternativeCount: entry?.alternativeTexts.length ?? 0,
    unexpected, // Requires semantic review; a new legitimate equivalent can be absent from our lexicon.
    excessive: (entry?.alternativeTexts.length ?? 0) > 2,
    controlViolation: !item.alternativesUseful && Boolean(entry?.alternativeTexts.length),
    usefulAlternativesPresent: item.alternativesUseful && Boolean(entry?.alternativeTexts.length),
  };
}
