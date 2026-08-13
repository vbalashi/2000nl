import { getDictionaryMeaningPromptFingerprint } from "./prompts/promptFingerprint";
import {
  isIdiomOnlyDictionaryMeaningRequest,
  type DictionaryMeaningTranslationRequestV1,
} from "./dictionaryMeaningTranslationContract";
import type { TranslationProviderName } from "./types";

export const TRANSLATION_PIPELINE_VERSION = "dictionary_meaning_v1";
export const IDIOM_ONLY_TRANSLATION_PIPELINE_VERSION =
  "dictionary_meaning_idiom_only_v2";

export function translationPipelineVersion(
  request?: DictionaryMeaningTranslationRequestV1,
) {
  return request && isIdiomOnlyDictionaryMeaningRequest(request)
    ? IDIOM_ONLY_TRANSLATION_PIPELINE_VERSION
    : TRANSLATION_PIPELINE_VERSION;
}

export function translationPolicyVersion(
  provider: TranslationProviderName,
  request?: DictionaryMeaningTranslationRequestV1,
) {
  return `${translationPipelineVersion(request)}:${getDictionaryMeaningPromptFingerprint(
    provider,
  )}`;
}
