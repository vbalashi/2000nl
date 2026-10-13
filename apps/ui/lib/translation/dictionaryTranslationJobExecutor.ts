import { fullSourceDictionaryTranslationEnabled } from "./dictionaryTranslationExecutionPolicy";
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
  translateDictionaryMeaning,
  resolveDictionaryMeaningTranslation,
  dictionaryMeaningTranslatedPaths,
} from "./dictionaryMeaningTranslationService";
import { getDictionaryMeaningPromptFingerprint } from "./prompts/promptFingerprint";
import { parseDictionaryMeaningTranslationResult } from "./dictionaryMeaningTranslationContract";
import {
  planDictionaryTranslationParts,
  aggregateDictionaryTranslationParts,
} from "./dictionaryTranslationParts";
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
  if (!fullSourceDictionaryTranslationEnabled()) {
    const legacy = await resolveDictionaryMeaningTranslation(
      translator,
      identity.request,
    );
    await readIdentity();
    return {
      request: identity.request,
      note: legacy.note,
      overlay:
        sanitizeTranslationOverlay({
          ...legacy.overlay,
          __meta: {
            providerSelected: provider,
            providerUsed: legacy.meta.providerUsed ?? provider,
            usedFallback: legacy.meta.usedFallback ?? false,
            promptFingerprint: identity.providerRevision,
            translatedPaths: dictionaryMeaningTranslatedPaths(identity.request),
          },
        }) ?? {},
    };
  }
  const parts = planDictionaryTranslationParts(identity.request);
  const { data: saved, error: readError } = await client
    .from("dictionary_translation_job_parts")
    .select("part_key,part_fingerprint,result")
    .eq("job_id", job.id);
  if (readError) throw readError;
  const results = parts.map((part) => {
    const row = saved?.find(
      (row) =>
        row.part_key === part.key && row.part_fingerprint === part.fingerprint,
    );
    if (!row) return null;
    try {
      return parseDictionaryMeaningTranslationResult(
        JSON.stringify(row.result.output ?? row.result),
        part.request,
      );
    } catch {
      return null;
    }
  });
  const missing = results.findIndex((result) => result === null);
  let meta: Awaited<ReturnType<typeof translateDictionaryMeaning>>["meta"] = {};
  if (missing !== -1) {
    const part = parts[missing];
    const translated = await translateDictionaryMeaning(
      translator,
      part.request,
    );
    meta = translated.meta;
    const result = parseDictionaryMeaningTranslationResult(
      JSON.stringify({
        entryTranslation: translated.entryTranslation,
        contentTranslations: translated.contentTranslations,
      }),
      part.request,
    );
    results[missing] = result;
    await readIdentity();
    const continuing = results.some((item) => item === null);
    const { data: stored, error: storeError } = await client.rpc(
      "checkpoint_dictionary_translation_part_v1",
      {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_part_key: part.key,
        p_part_fingerprint: part.fingerprint,
        p_result: {
          output: result,
          meta:
            sanitizeTranslationOverlay({
              __meta: {
                providerUsed: meta?.providerUsed ?? provider,
                usedFallback: meta?.usedFallback ?? false,
                primaryFailure: meta?.primaryFailure,
              },
            })?.__meta ?? {},
        },
        p_continue: continuing,
      },
    );
    if (storeError) throw storeError;
    if (stored !== true) throw new DictionaryTranslationJobSourceChangedError();
    if (continuing) return { continuation: true as const };
  }
  const { overlay, note } = aggregateDictionaryTranslationParts(
    identity.request,
    parts,
    results.map((result) => {
      if (!result) throw new Error("translation_parts_incomplete");
      return result;
    }),
  );
  await readIdentity(); // a source edit during generation cannot publish ready
  const allMetadata = [
    ...(saved?.map(
      (row) =>
        sanitizeTranslationOverlay({ __meta: row.result.meta })?.__meta ?? {},
    ) ?? []),
    meta ?? {},
  ];
  const fallback = allMetadata.find(
    (item) => item.providerUsed && item.providerUsed !== provider,
  );
  const used = fallback?.providerUsed ?? meta?.providerUsed ?? provider;
  return {
    request: identity.request,
    note,
    overlay:
      sanitizeTranslationOverlay({
        ...overlay,
        __meta: {
          providerSelected: provider,
          providerUsed: used,
          usedFallback:
            allMetadata.some((item) => item.usedFallback === true) ||
            Boolean(fallback),
          ...((fallback?.primaryFailure ?? meta?.primaryFailure)
            ? {
                primaryFailure:
                  fallback?.primaryFailure ?? meta?.primaryFailure,
              }
            : {}),
          promptFingerprint: getDictionaryMeaningPromptFingerprint(used),
          translatedPaths: dictionaryMeaningTranslatedPaths(identity.request),
        },
      }) ?? {},
  };
}
