import { getTranslationPromptFingerprint } from "./prompts/promptFingerprint";
import type { TranslationProviderName } from "./types";

export const TRANSLATION_PIPELINE_VERSION = "dictionary_meaning_v1";

export function translationPolicyVersion(
  provider: TranslationProviderName,
) {
  return `${TRANSLATION_PIPELINE_VERSION}:${getTranslationPromptFingerprint(
    provider,
  )}`;
}
