import type { TranslationOverlay } from "../types";
import type { DictionaryMeaningTranslationResultV1 } from "./dictionaryMeaningTranslationContract";

export function buildDictionaryMeaningTranslationArtifact(
  result: DictionaryMeaningTranslationResultV1,
): TranslationOverlay {
  const overlay: TranslationOverlay = {
    entryTranslation: result.entryTranslation,
    ...(result.entryTranslation
      ? {
          headword: result.entryTranslation.primaryText,
        }
      : {}),
    meanings: [{}],
  };
  const meaning = overlay.meanings![0];

  for (const field of result.contentTranslations) {
    if (field.fieldId === "definition") meaning.definition = field.text;
    if (field.fieldId === "usage-pattern") meaning.context = field.text;
    if (field.fieldId === "usage-note") meaning.note = field.text;
    const exampleMatch = field.fieldId.match(/^example:(\d+)$/);
    if (exampleMatch) {
      meaning.examples ??= [];
      meaning.examples[Number(exampleMatch[1])] = field.text;
    }
    const idiomMatch = field.fieldId.match(/^idiom:(\d+)$/);
    if (idiomMatch) {
      meaning.idioms ??= [];
      meaning.idioms[Number(idiomMatch[1])] = { expression: field.text };
    }
    const explanationMatch = field.fieldId.match(/^idiom:(\d+):explanation$/);
    if (explanationMatch) {
      meaning.idioms ??= [];
      const index = Number(explanationMatch[1]);
      const existing = meaning.idioms[index];
      meaning.idioms[index] = {
        ...(existing && typeof existing === "object" ? existing : {}),
        explanation: field.text,
      };
    }
    const idiomExampleMatch = field.fieldId.match(
      /^idiom:(\d+):example:(\d+)$/,
    );
    if (idiomExampleMatch) {
      meaning.idioms ??= [];
      const idiomIndex = Number(idiomExampleMatch[1]);
      const exampleIndex = Number(idiomExampleMatch[2]);
      const existing = meaning.idioms[idiomIndex];
      const idiom = {
        ...(existing && typeof existing === "object" ? existing : {}),
      };
      idiom.examples ??= [];
      idiom.examples[exampleIndex] = field.text;
      meaning.idioms[idiomIndex] = idiom;
    }
  }
  return overlay;
}
