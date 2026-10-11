import { withDictionaryTranslationDeadline } from "./dictionaryTranslationDeadline";
import type { DictionaryLookupPayload } from "../platform/lookupService";
import { getTranslationServiceSupabase } from "../platform/serverSupabase";
import { coordinateDictionaryMeaningTranslation } from "./dictionaryMeaningTranslationCoordinator";
import { dictionaryMeaningTranslationIdentity } from "./dictionaryMeaningTranslationIdentity";
import { dictionaryMeaningTranslationCoverage } from "./dictionaryMeaningTranslationReadiness";
import {
  createTranslator,
  loadTranslationConfigFromEnv,
} from "./translationProvider";
import {
  TRANSLATION_PROVIDER_FAILURE_CODES,
  normalizeTranslationProviderError,
} from "./translationProviderFailure";
import { sanitizeTranslationOverlay } from "./translationArtifactSafety";

type RequestInput = {
  wordEntryId: string;
  word: DictionaryLookupPayload;
  targetLang: string;
  dbLang: string;
  force?: boolean;
  debug?: boolean;
  observeOnly?: boolean;
  priority?: number;
};

/** Caller must authenticate and check dictionary access before entering. */
export async function requestDictionaryMeaningTranslation(input: RequestInput) {
  if (process.env.DICTIONARY_TRANSLATION_JOBS_ENABLED !== "true") {
    return coordinateDictionaryMeaningTranslation(input);
  }
  try {
    return await withDictionaryTranslationDeadline(
      () => requestQueuedDictionaryTranslation(input),
      15_000,
    );
  } catch (error) {
    return {
      payload: { error: normalizeTranslationProviderError(error).message },
      httpStatus: 503,
      cacheStatus: "unknown",
    };
  }
}

async function requestQueuedDictionaryTranslation(input: RequestInput) {
  const service = getTranslationServiceSupabase();
  if (service instanceof Response)
    return {
      payload: { error: "supabase_service_not_configured" },
      httpStatus: 500,
      cacheStatus: "unknown",
    };
  const { supabase } = service;
  try {
    const { provider } = createTranslator(
      loadTranslationConfigFromEnv({ purpose: "dictionary" }),
    );
    const identity = await dictionaryMeaningTranslationIdentity({
      ...input,
      provider,
    });
    const { data: cached, error: cacheError } = await supabase
      .from("word_entry_translations")
      .select(
        "status,overlay,note,source_fingerprint,source_content_revision,translation_policy_version,updated_at",
      )
      .eq("word_entry_id", input.wordEntryId)
      .eq("target_lang", input.dbLang)
      .eq("provider", provider)
      .maybeSingle();
    if (cacheError) throw cacheError;
    const overlay = sanitizeTranslationOverlay(cached?.overlay);
    if (
      !input.force &&
      cached?.status === "ready" &&
      cached.source_fingerprint === identity.fingerprint &&
      cached.source_content_revision === identity.sourceContentRevision &&
      cached.translation_policy_version === identity.policyVersion &&
      dictionaryMeaningTranslationCoverage(identity.request, overlay)
        .requestComplete
    ) {
      return {
        payload: { status: "ready", overlay, note: cached.note ?? null },
        httpStatus: 200,
        cacheStatus: "hit",
      };
    }
    let job: any;
    if (input.observeOnly) {
      const { data, error } = await supabase
        .from("dictionary_translation_jobs")
        .select("id,status,attempt,error_code,available_at")
        .eq("word_entry_id", input.wordEntryId)
        .eq("target_lang", input.dbLang)
        .eq("provider", provider)
        .eq("source_fingerprint", identity.fingerprint)
        .eq("source_content_revision", identity.sourceContentRevision)
        .eq("translation_policy_version", identity.policyVersion)
        .eq("provider_revision", identity.providerRevision)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      job = data;
    } else {
      const { data, error } = await supabase.rpc(
        "enqueue_dictionary_translation_job_v1",
        {
          p_word_entry_id: input.wordEntryId,
          p_target_lang: input.dbLang,
          p_provider: provider,
          p_source_fingerprint: identity.fingerprint,
          p_source_content_revision: identity.sourceContentRevision,
          p_translation_policy_version: identity.policyVersion,
          p_provider_revision: identity.providerRevision,
          p_priority: input.priority ?? 10,
          p_retry_failed: input.force ?? false,
          p_refresh_ready: true,
          p_observed_cache_updated_at: cached?.updated_at ?? null,
        },
      );
      if (error) throw error;
      job = Array.isArray(data) ? data[0] : data;
      if (!job?.id) throw new Error("translation_job_enqueue_unconfirmed");
    }
    if (job?.status === "failed" && job.error_code !== "source_changed") {
      const error = normalizeTranslationProviderError(
        new Error("translation_job_failed"),
        TRANSLATION_PROVIDER_FAILURE_CODES.find(
          (code) => code === job.error_code,
        ) ?? "provider_unknown_error",
      ).message;
      return {
        payload: {
          status: "failed",
          error,
          job: { id: job.id, status: job.status, attempt: job.attempt },
        },
        httpStatus: 200,
        cacheStatus: "pending",
      };
    }
    return {
      payload: {
        status: "pending",
        retryAfterMs: 1_000,
        needsEnqueue:
          !job ||
          job.status === "ready" ||
          job.status === "superseded" ||
          job.error_code === "source_changed",
        ...(job
          ? { job: { id: job.id, status: job.status, attempt: job.attempt } }
          : {}),
      },
      httpStatus: 200,
      cacheStatus: "pending",
    };
  } catch (error) {
    return {
      payload: { error: normalizeTranslationProviderError(error).message },
      httpStatus: 503,
      cacheStatus: "unknown",
    };
  }
}
