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
      entryId: item.entryId ?? `eval:${item.id}`,
      sourceContentFingerprint:
        item.sourceContentFingerprint ??
        crypto.createHash("sha256").update(JSON.stringify(item.word)).digest("hex"),
      sourceLanguageCode: "nl",
      targetLanguageCode: item.targetLang,
      word: item.word,
    }),
  };
}

export function requestFingerprint(
  request: DictionaryMeaningTranslationRequestV1,
) {
  return crypto.createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export function evaluateDictionaryMeaningPrimaryText(
  primaryText: string | null,
  expectations: TranslationEvalCase["expectations"],
) {
  const rules = expectations.primaryText;
  if (!rules) return { status: "not-configured" as const };
  const normalized = primaryText?.normalize("NFC").toLocaleLowerCase("ru") ?? "";
  const missingRequiredSemanticUnits = rules.required
    .filter(
      (rule) =>
        !rule.anyOf.some((term) =>
          normalized.includes(term.normalize("NFC").toLocaleLowerCase("ru")),
        ),
    )
    .map((rule) => rule.semanticUnit);
  const forbiddenSensesPresent = rules.forbidden
    .filter((rule) =>
      rule.anyOf.some((term) =>
        normalized.includes(term.normalize("NFC").toLocaleLowerCase("ru")),
      ),
    )
    .map((rule) => rule.sense);
  return {
    status: "evaluated" as const,
    passed:
      missingRequiredSemanticUnits.length === 0 &&
      forbiddenSensesPresent.length === 0,
    missingRequiredSemanticUnits,
    forbiddenSensesPresent,
  };
}
