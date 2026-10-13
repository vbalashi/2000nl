import type { DictionaryLookupPayload } from "../platform/lookupService";
import {
  contentFingerprint,
  normalizeDictionaryContent,
  verifyDictionaryContentAudioLinks,
} from "../platform/projections/dictionaryContent";
import { fullSourceDictionaryTranslationEnabled } from "./dictionaryTranslationExecutionPolicy";
import { buildDictionaryMeaningTranslationInventory, buildDictionaryMeaningTranslationRequest } from "./dictionaryMeaningTranslationContract";
import { dictionaryMeaningTranslationFingerprint } from "./dictionaryMeaningTranslationService";
import { getDictionaryMeaningPromptFingerprint } from "./prompts/promptFingerprint";
import {
  translationPipelineVersion,
  translationPolicyVersion,
} from "./translationPolicy";
import type { TranslationProviderName } from "./types";

export async function dictionaryMeaningTranslationIdentity(input: {
  wordEntryId: string;
  word: DictionaryLookupPayload;
  dbLang: string;
  provider: TranslationProviderName;
}) {
  const sourceContent = await verifyDictionaryContentAudioLinks(
    normalizeDictionaryContent(input.word),
  );
  const sourceContentRevision = contentFingerprint(sourceContent);
  const providerRevision = getDictionaryMeaningPromptFingerprint(
    input.provider,
  );
  const request = (fullSourceDictionaryTranslationEnabled()?buildDictionaryMeaningTranslationInventory:buildDictionaryMeaningTranslationRequest)({
    entryId: input.wordEntryId,
    sourceContentFingerprint: sourceContentRevision,
    sourceLanguageCode:
      typeof input.word.language_code === "string"
        ? input.word.language_code
        : "nl",
    targetLanguageCode: input.dbLang,
    word: input.word,
  });
  return {
    request,
    sourceContentRevision,
    providerRevision,
    policyVersion: translationPolicyVersion(input.provider, request),
    fingerprint: dictionaryMeaningTranslationFingerprint({
      request,
      pipelineVersion: translationPipelineVersion(request),
      provider: input.provider,
      promptFingerprint: providerRevision,
    }),
  };
}
