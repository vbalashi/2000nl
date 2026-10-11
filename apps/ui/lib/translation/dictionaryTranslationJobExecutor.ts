import type { SupabaseClient } from "@supabase/supabase-js";
import type { DictionaryLookupPayload } from "../platform/lookupService";
import { dictionaryMeaningTranslationIdentity } from "./dictionaryMeaningTranslationIdentity";
import {
  DictionaryTranslationJobSourceChangedError,
  type DictionaryTranslationJob,
} from "./dictionaryTranslationJobWorker";
import {
  createTranslator,
  loadTranslationConfigFromEnv,
} from "./translationProvider";
import {
  resolveDictionaryMeaningTranslation,
  dictionaryMeaningTranslatedPaths,
} from "./dictionaryMeaningTranslationService";
import { getDictionaryMeaningPromptFingerprint } from "./prompts/promptFingerprint";
import { sanitizeTranslationOverlay } from "./translationArtifactSafety";

/** Re-read trusted dictionary data; never execute a browser-supplied prompt. */
export async function executeDictionaryTranslationJob(
  client: SupabaseClient,
  job: DictionaryTranslationJob,
) {
  const { provider, translator } = createTranslator(
    loadTranslationConfigFromEnv({ purpose: "dictionary" }),
  );
  if (provider !== job.provider)
    throw new DictionaryTranslationJobSourceChangedError();
  const readIdentity = async () => {
    const { data: source, error } = await client.rpc(
      "dictionary_translation_source_v1",
      { p_entry_id: job.word_entry_id },
    );
    if (error) throw error;
    if (!source?.word?.raw || source.revision !== job.source_row_revision)
      throw new DictionaryTranslationJobSourceChangedError();
    const data = source.word;
    const identity = await dictionaryMeaningTranslationIdentity({
      wordEntryId: job.word_entry_id,
      word: data as DictionaryLookupPayload,
      dbLang: job.target_lang,
      provider,
    });
    if (
      identity.fingerprint !== job.source_fingerprint ||
      identity.sourceContentRevision !== job.source_content_revision ||
      identity.policyVersion !== job.translation_policy_version ||
      identity.providerRevision !== job.provider_revision
    )
      throw new DictionaryTranslationJobSourceChangedError();
    return identity;
  };
  const identity = await readIdentity();
  const { overlay, note, meta } = await resolveDictionaryMeaningTranslation(
    translator,
    identity.request,
  );
  await readIdentity(); // a source edit during generation cannot publish ready
  const used = meta.providerUsed ?? provider;
  return {
    request: identity.request,
    note,
    overlay:
      sanitizeTranslationOverlay({
        ...overlay,
        __meta: {
          providerSelected: provider,
          providerUsed: used,
          usedFallback: meta.usedFallback ?? false,
          ...(meta.primaryFailure
            ? { primaryFailure: meta.primaryFailure }
            : {}),
          promptFingerprint: getDictionaryMeaningPromptFingerprint(used),
          translatedPaths: dictionaryMeaningTranslatedPaths(identity.request),
        },
      }) ?? {},
  };
}
