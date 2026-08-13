import { getDictionaryMeaningPromptFingerprint } from "./prompts/promptFingerprint";
import type { TranslationProviderName } from "./types";

export const TRANSLATION_PIPELINE_VERSION = "dictionary_meaning_v2";

export function translationPolicyVersion(
  provider: TranslationProviderName,
) {
  return `${TRANSLATION_PIPELINE_VERSION}:${getDictionaryMeaningPromptFingerprint(
    provider,
  )}`;
}
