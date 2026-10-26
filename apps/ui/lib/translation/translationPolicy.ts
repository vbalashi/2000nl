import { fullSourceDictionaryTranslationEnabled } from "./dictionaryTranslationExecutionPolicy";
import { getDictionaryMeaningPromptFingerprint } from "./prompts/promptFingerprint";
import {
  isIdiomOnlyDictionaryMeaningRequest,
  type DictionaryMeaningTranslationRequestV1,
} from "./dictionaryMeaningTranslationContract";
import type { TranslationProviderName } from "./types";

export const TRANSLATION_PIPELINE_VERSION = "dictionary_meaning_full_source_v4";
export const IDIOM_ONLY_TRANSLATION_PIPELINE_VERSION =
  "dictionary_meaning_idiom_only_full_source_v4";

export function translationPipelineVersion(
  request: DictionaryMeaningTranslationRequestV1,
) {
  if (!fullSourceDictionaryTranslationEnabled())
    return isIdiomOnlyDictionaryMeaningRequest(request)
      ? "dictionary_meaning_idiom_only_full_budget_v3"
      : "dictionary_meaning_full_budget_v3";
  return isIdiomOnlyDictionaryMeaningRequest(request)
    ? IDIOM_ONLY_TRANSLATION_PIPELINE_VERSION
    : TRANSLATION_PIPELINE_VERSION;
}

export function translationPolicyVersion(
  provider: TranslationProviderName,
  request: DictionaryMeaningTranslationRequestV1,
) {
  return `${translationPipelineVersion(request)}:${getDictionaryMeaningPromptFingerprint(
    provider,
  )}`;
}

export function ordinaryTranslationPolicyVersion(
  provider: TranslationProviderName,
) {
  return `${fullSourceDictionaryTranslationEnabled() ? TRANSLATION_PIPELINE_VERSION : "dictionary_meaning_full_budget_v3"}:${getDictionaryMeaningPromptFingerprint(
    provider,
  )}`;
}
