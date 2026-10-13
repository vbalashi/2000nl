import type { TranslationOverlay } from "../types";
import {
  isIdiomOnlyDictionaryMeaningRequest,
  type DictionaryMeaningTranslationRequestV1,
} from "./dictionaryMeaningTranslationContract";

/** Actual artifact values, never a claim based only on __meta. */
export function dictionaryMeaningTranslationCoverage(
  request: DictionaryMeaningTranslationRequestV1,
  overlay: TranslationOverlay | null | undefined,
  requiredFieldIds: readonly string[] = request.content.map(
    (item) => item.fieldId,
  ),
) {
  const missingFieldIds = request.content
    .filter((item) => !translatedField(overlay, item.fieldId))
    .map((item) => item.fieldId);
  const known = new Set(request.content.map((item) => item.fieldId));
  const missingRequiredFieldIds = requiredFieldIds.filter(
    (id) => !known.has(id) || !translatedField(overlay, id),
  );
  const entryReady =
    isIdiomOnlyDictionaryMeaningRequest(request) ||
    nonempty(overlay?.entryTranslation?.primaryText) ||
    nonempty(overlay?.headword);
  return {
    entryReady,
    cardReady: entryReady && missingRequiredFieldIds.length === 0,
    // Whole-source completeness additionally requires the source inventory,
    // including fields that a bounded request omitted.
    requestComplete: entryReady && missingFieldIds.length === 0,
    requestedFields: request.content.length,
    translatedFields: request.content.length - missingFieldIds.length,
    missingFieldIds,
    missingRequiredFieldIds,
  };
}
function nonempty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
function translatedField(
  overlay: TranslationOverlay | null | undefined,
  fieldId: string,
): boolean {
  const scoped = fieldId.match(/^meaning:(\d+):(.+)$/);
  const meaning = overlay?.meanings?.[scoped ? Number(scoped[1]) : 0];
  if (scoped) fieldId = scoped[2];
  if (fieldId === "definition") return nonempty(meaning?.definition);
  if (fieldId === "usage-pattern") return nonempty(meaning?.context);
  if (fieldId === "usage-note") return nonempty(meaning?.note);
  const example = fieldId.match(/^example:(\d+)$/);
  if (example) return nonempty(meaning?.examples?.[Number(example[1])]);
  const relation = fieldId.match(/^(synonym|antonym):(\d+)$/);
  if (relation)
    return nonempty(
      meaning?.[relation[1] === "synonym" ? "synonyms" : "antonyms"]?.[
        Number(relation[2])
      ],
    );
  const match = fieldId.match(
    /^idiom:(\d+)(?::example:(\d+)|:(explanation))?$/,
  );
  if (!match) return false;
  const idiom = meaning?.idioms?.[Number(match[1])];
  if (typeof idiom === "string")
    return !match[2] && !match[3] && nonempty(idiom);
  if (match[2]) return nonempty(idiom?.examples?.[Number(match[2])]);
  if (match[3]) return nonempty(idiom?.explanation);
  return nonempty(idiom?.expression);
}
