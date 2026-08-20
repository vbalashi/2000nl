import {
  buildOpenAITranslationMessages,
  type OpenAITranslationMessage,
} from "../lib/translation/openaiTranslationContract";
import { dictionaryTranslationContext } from "../lib/translation/dictionaryTranslationContext";
import { extractTranslatableTexts } from "../lib/translation/extractTranslatableTexts";
import type { TranslationEvalCase } from "./translationEvalCases";
import {
  buildDictionaryMeaningTranslationRequest,
  type DictionaryMeaningTranslationRequestV1,
} from "../lib/translation/dictionaryMeaningTranslationContract";
import crypto from "node:crypto";

export type PreparedTranslationEvalCase = {
  id: string;
  targetLang: string;
  texts: string[];
  context: ReturnType<typeof dictionaryTranslationContext>;
  messages: OpenAITranslationMessage[];
  expectations: TranslationEvalCase["expectations"];
};

export function prepareTranslationEvalCase(
  item: TranslationEvalCase,
): PreparedTranslationEvalCase {
  const texts = extractTranslatableTexts(item.word).map((field) => field.text);
  const context = dictionaryTranslationContext(item.word.part_of_speech);
  return {
    id: item.id,
    targetLang: item.targetLang,
    texts,
    context,
    messages: buildOpenAITranslationMessages(texts, item.targetLang, context),
    expectations: item.expectations,
  };
}

export function prepareTranslationEvalRun(
  cases: TranslationEvalCase[],
  options: { caseId?: string | null; casePrefix?: string | null } = {},
): PreparedTranslationEvalCase[] {
  return cases
    .filter(
      (item) =>
        (!options.caseId || item.id === options.caseId) &&
        (!options.casePrefix || item.id.startsWith(options.casePrefix)),
    )
    .map(prepareTranslationEvalCase);
}

export function prepareDictionaryMeaningEvalCase(item: TranslationEvalCase): {
  id: string;
  expectations: TranslationEvalCase["expectations"];
  request: DictionaryMeaningTranslationRequestV1;
} {
  return {
    id: item.id,
    expectations: item.expectations,
    request: buildDictionaryMeaningTranslationRequest({
      entryId: `eval:${item.id}`,
      sourceContentFingerprint: crypto
        .createHash("sha256")
        .update(JSON.stringify(item.word))
        .digest("hex"),
      sourceLanguageCode: "nl",
      targetLanguageCode: item.targetLang,
      word: item.word,
    }),
  };
}
