import { createClient } from "@supabase/supabase-js";
import type { TranslationOverlay, WordEntryTranslationStatus } from "@/lib/types";
import {
  createTranslator,
  loadTranslationConfigFromEnv,
} from "@/lib/translation/translationProvider";
import type { ITranslator } from "@/lib/translation/ITranslator";
import type { TranslationProviderName } from "@/lib/translation/types";
import { getDictionaryMeaningPromptFingerprint } from "@/lib/translation/prompts/promptFingerprint";
import {
  translationPipelineVersion,
  translationPolicyVersion,
} from "@/lib/translation/translationPolicy";
import type { DictionaryLookupPayload } from "@/lib/platform/lookupService";
import {
  contentFingerprint,
  normalizeDictionaryContent,
  verifyDictionaryContentAudioLinks,
} from "@/lib/platform/projections/dictionaryContent";
import { buildDictionaryMeaningTranslationRequest } from "@/lib/translation/dictionaryMeaningTranslationContract";
import {
  dictionaryMeaningTranslationFingerprint,
  dictionaryMeaningTranslatedPaths,
  resolveDictionaryMeaningTranslation,
} from "@/lib/translation/dictionaryMeaningTranslationService";
import { normalizeTranslationProviderError } from "@/lib/translation/translationProviderFailure";
import {
  sanitizeStoredTranslationError,
  sanitizeTranslationOverlay,
} from "@/lib/translation/translationArtifactSafety";
import {
  newDictionaryMeaningTranslationClaimRevision,
  updateOwnedDictionaryMeaningTranslation,
} from "@/lib/translation/dictionaryMeaningTranslationCache";

type TranslationRow = {
  word_entry_id: string;
  target_lang: string;
  provider: string;
  status: WordEntryTranslationStatus;
  overlay: TranslationOverlay | null;
  note: string | null;
  source_fingerprint: string | null;
  source_content_revision: string | null;
  translation_policy_version: string | null;
  provider_revision: string | null;
  error_message: string | null;
  updated_at: string | null;
};

function isFresh(updatedAt: string | null | undefined, freshForMs: number) {
  if (!updatedAt) return false;
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < freshForMs;
}

function attachOverlayMeta(
  overlay: TranslationOverlay,
  meta: TranslationOverlay["__meta"]
): TranslationOverlay {
  const safeOverlay = sanitizeTranslationOverlay(overlay) ?? {};
  return sanitizeTranslationOverlay({
    ...safeOverlay,
    __meta: {
      ...(safeOverlay.__meta ?? {}),
      ...(meta ?? {}),
    },
  }) ?? {};
}

export type DictionaryMeaningTranslationCoordinatorResult = {
  payload: Record<string, unknown>;
  status: number;
  cacheStatus: "hit" | "pending" | "provider" | "unknown";
};

function coordinatorResult(
  payload: Record<string, unknown>,
  init: { status?: number; headers?: Record<string, string> } = {},
): DictionaryMeaningTranslationCoordinatorResult {
  const cacheStatus = init.headers?.["X-Translation-Cache"];
  return {
    payload,
    status: init.status ?? 200,
    cacheStatus:
      cacheStatus === "hit" || cacheStatus === "pending" || cacheStatus === "provider"
        ? cacheStatus
        : "unknown",
  };
}

export async function coordinateDictionaryMeaningTranslation(input: {
  wordEntryId: string;
  word: DictionaryLookupPayload;
  targetLang: string;
  dbLang: string;
  force?: boolean;
  debug?: boolean;
}): Promise<DictionaryMeaningTranslationCoordinatorResult> {
  const {
    wordEntryId,
    word,
    targetLang,
    dbLang,
    force = false,
    debug = false,
  } = input;

  let provider: TranslationProviderName;
  let translator: ITranslator;
  const config = loadTranslationConfigFromEnv();
  try {
    const resolved = createTranslator(config);
    provider = resolved.provider;
    translator = resolved.translator;
  } catch (err: unknown) {
    const message = normalizeTranslationProviderError(err).message;
    return coordinatorResult(
      {
        error: message,
        ...(debug
          ? {
              debug: {
                dbLang,
                targetLang,
                translation: {
                  providerEnv: config.provider,
                  fallbackEnv: config.fallback ?? null,
                  hasKeys: {
                    openai: Boolean(config.apiKeys.openai),
                    deepl: Boolean(config.apiKeys.deepl),
                    gemini: Boolean(config.apiKeys.gemini),
                  },
                },
              },
            }
          : null),
      },
      { status: 500 },
    );
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Supabase is transitioning away from legacy JWT keys.
  // Prefer the new "secret key (default)" (store it as SUPABASE_SECRET_KEY),
  // but keep legacy env var name as fallback for existing setups.
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return coordinatorResult(
      {
        error: "Server is not configured",
        missing: {
          supabaseUrl: !supabaseUrl,
          serviceKey: !serviceKey,
        },
        ...(debug
          ? {
              debug: {
                hasSupabaseUrl: Boolean(supabaseUrl),
                hasServiceKey: Boolean(serviceKey),
              },
            }
          : null),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const supabaseProject = (() => {
    const m = supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co/);
    return m?.[1] ?? null;
  })();

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next.js can cache fetch() calls in server contexts; ensure Supabase reads aren't cached
    // (otherwise we can get stuck seeing a stale "no rows" result forever).
    global: {
      fetch: (input, init) => fetch(input as any, { ...(init ?? {}), cache: "no-store" }),
    },
  });

  const lookup = () =>
    supabase
      .from("word_entry_translations")
      .select(
        "word_entry_id,target_lang,provider,status,overlay,note,source_fingerprint,source_content_revision,translation_policy_version,provider_revision,error_message,updated_at"
      )
      .eq("word_entry_id", wordEntryId)
      .eq("target_lang", dbLang)
      .eq("provider", provider)
      .maybeSingle();

  const { data: existing, error: existingError } = await lookup();
  if (existingError) {
    return coordinatorResult(
      {
        error: existingError.message,
        ...(debug
          ? {
              debug: {
                dbLang,
                targetLang,
                provider,
                supabaseProject,
              },
            }
          : null),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const overlayHasEntryArtifact =
    Boolean(existing?.overlay) &&
    ("headword" in ((existing?.overlay ?? {}) as any) ||
      "entryTranslation" in ((existing?.overlay ?? {}) as any));
  // NOTE:
  // We intentionally delay the "ready" fast-path until after we compute the
  // current source_fingerprint, so cached overlays get refreshed when the
  // translation input changes (e.g. when including "de/het" with headword).

  // IMPORTANT:
  // This endpoint is the "worker" that produces translations. If we *only*
  // returned 'pending' here, a crashed/aborted request could leave rows stuck
  // in 'pending' forever (no background job will fix it).
  //
  // We still avoid duplicate in-flight work by treating very recent 'pending'
  // as fresh and returning it so the other request can finish.
  const sourceContent = await verifyDictionaryContentAudioLinks(
    normalizeDictionaryContent(word as DictionaryLookupPayload),
  );
  const sourceContentRevision = contentFingerprint(sourceContent);
  const selectedProviderRevision =
    getDictionaryMeaningPromptFingerprint(provider);
  const meaningRequest = buildDictionaryMeaningTranslationRequest({
    entryId: wordEntryId,
    sourceContentFingerprint: sourceContentRevision,
    sourceLanguageCode:
      typeof (word as any)?.language_code === "string"
        ? (word as any).language_code
        : "nl",
    targetLanguageCode: dbLang,
    word,
  });
  const currentTranslationPolicyVersion = translationPolicyVersion(
    provider,
    meaningRequest,
  );
  const fingerprint = dictionaryMeaningTranslationFingerprint({
    request: meaningRequest,
    pipelineVersion: translationPipelineVersion(meaningRequest),
    provider,
    promptFingerprint: selectedProviderRevision,
  });
  const pendingFreshForMs = 15_000;
  if (
    existing?.status === "pending" &&
    existing.source_fingerprint === fingerprint &&
    existing.source_content_revision === sourceContentRevision &&
    existing.translation_policy_version === currentTranslationPolicyVersion &&
    isFresh(existing.updated_at, pendingFreshForMs)
  ) {
    return coordinatorResult(
      {
        status: existing.status,
        ...(debug
          ? {
                debug: {
                  branch: "fresh_pending",
                  dbLang,
                  targetLang,
                  provider,
                  existingUpdatedAt: existing.updated_at,
                  pendingFreshForMs,
                  supabaseProject,
              },
            }
          : null),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Translation-Cache": "pending",
        },
      }
    );
  }

  // Fast-path: return cached overlay only if it matches the current fingerprint.
  if (
    !force &&
    existing &&
    existing.status === "ready" &&
    existing.overlay &&
    overlayHasEntryArtifact &&
    existing.source_fingerprint &&
    existing.source_fingerprint === fingerprint &&
    existing.source_content_revision === sourceContentRevision &&
    existing.translation_policy_version === currentTranslationPolicyVersion
  ) {
    return coordinatorResult(
      {
        status: existing.status,
        overlay: sanitizeTranslationOverlay(existing.overlay),
        note: (existing as TranslationRow).note ?? null,
        ...(debug
          ? {
                debug: {
                  branch: "fast_ready_fingerprint_match",
                  dbLang,
                  targetLang,
                  provider,
                  existingUpdatedAt: existing.updated_at,
                  supabaseProject,
              },
            }
          : null),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Translation-Cache": "hit",
        },
      }
    );
  }

  // Ensure row exists; if it doesn't, create pending row (race guard via unique constraint).
  let claimUpdatedAt: string | null = null;
  if (!existing) {
    const insertClaimUpdatedAt =
      newDictionaryMeaningTranslationClaimRevision();
    const { data: inserted, error: insertError } = await supabase
      .from("word_entry_translations")
      .upsert(
        {
          word_entry_id: wordEntryId,
          target_lang: dbLang,
          provider,
          status: "pending",
          overlay: null,
          note: null,
          source_fingerprint: fingerprint,
          source_content_revision: sourceContentRevision,
          translation_policy_version: currentTranslationPolicyVersion,
          provider_revision: selectedProviderRevision,
          error_message: null,
          updated_at: insertClaimUpdatedAt,
        },
        { onConflict: "word_entry_id,target_lang,provider", ignoreDuplicates: true }
      )
      .select("word_entry_id")
      .maybeSingle();

    if (insertError) {
      return coordinatorResult(
        {
          error: insertError.message,
          ...(debug
            ? {
                debug: {
                  branch: "insert_error",
                  dbLang,
                  targetLang,
                  provider,
                  supabaseProject,
                },
              }
            : null),
        },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    // If we lost the race, return current state (could already be ready).
    if (!inserted) {
      const { data: existingAfter, error: existingAfterError } = await lookup();
      if (existingAfterError) {
        return coordinatorResult(
          {
            error: existingAfterError.message,
            ...(debug
              ? {
                  debug: {
                  branch: "lookup_after_insert_error",
                  dbLang,
                  targetLang,
                  provider,
                  supabaseProject,
                },
              }
            : null),
          },
          { status: 500, headers: { "Cache-Control": "no-store" } }
        );
      }
      if (existingAfter) {
        return coordinatorResult(
          {
            status: existingAfter.status,
            overlay: sanitizeTranslationOverlay(existingAfter.overlay),
            note: (existingAfter as TranslationRow).note ?? null,
            error: sanitizeStoredTranslationError(existingAfter.error_message),
            ...(debug
              ? {
                  debug: {
                  branch: "lost_race_return_existing",
                  dbLang,
                  targetLang,
                  provider,
                  existingUpdatedAt: existingAfter.updated_at,
                  overlayHasHeadword:
                      Boolean(existingAfter.overlay) &&
                      "headword" in ((existingAfter.overlay ?? {}) as any),
                    supabaseProject,
                  },
                }
              : null),
          },
          {
            status: 200,
            headers: {
              "Cache-Control": "no-store",
              "X-Translation-Cache":
                existingAfter.status === "ready" ? "hit" : "pending",
            },
          }
        );
      }

      return coordinatorResult(
        {
          status: "pending" as const,
          ...(debug
            ? {
                debug: {
                  branch: "lost_race_no_row",
                  dbLang,
                  targetLang,
                  provider,
                  supabaseProject,
                },
              }
            : null),
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "X-Translation-Cache": "pending",
          },
        }
      );
    }
    claimUpdatedAt = insertClaimUpdatedAt;
  }

  // If a row exists but isn't ready (or is ready-but-missing-headword), mark it pending and re-run translation.
  // We do a conditional update to reduce stampedes: only the request that successfully
  // flips/refreshes updated_at should proceed; losers return current state.
  if (existing) {
    const needsWork =
      force ||
      existing.status !== "ready" ||
      (existing.status === "ready" && !overlayHasEntryArtifact) ||
      !existing.source_fingerprint ||
      existing.source_fingerprint !== fingerprint ||
      existing.source_content_revision !== sourceContentRevision ||
      existing.translation_policy_version !== currentTranslationPolicyVersion;

    if (needsWork) {
      const nowIso = newDictionaryMeaningTranslationClaimRevision(
        new Date(),
        existing.updated_at,
      );
      const { data: claimed, error: claimError } = await supabase
        .from("word_entry_translations")
        .update({
          status: "pending",
          error_message: null,
          note: null,
          source_fingerprint: fingerprint,
          source_content_revision: sourceContentRevision,
          translation_policy_version: currentTranslationPolicyVersion,
          provider_revision: selectedProviderRevision,
          updated_at: nowIso,
        })
        .eq("word_entry_id", wordEntryId)
        .eq("target_lang", dbLang)
        .eq("provider", provider)
        .eq("updated_at", (existing as TranslationRow).updated_at ?? null)
        .select("word_entry_id")
        .maybeSingle();

      if (claimError) {
        return coordinatorResult(
          { error: claimError.message },
          { status: 500, headers: { "Cache-Control": "no-store" } }
        );
      }

      // If we failed to claim (someone else updated it), return current state.
      if (!claimed) {
        const { data: existingAfter, error: existingAfterError } = await lookup();
        if (existingAfterError) {
          return coordinatorResult(
            { error: existingAfterError.message },
            { status: 500, headers: { "Cache-Control": "no-store" } }
          );
        }
        return coordinatorResult(
          {
            status: existingAfter?.status ?? ("pending" as const),
            overlay: sanitizeTranslationOverlay(existingAfter?.overlay),
            note: (existingAfter as any)?.note ?? null,
            error: sanitizeStoredTranslationError(existingAfter?.error_message),
          },
          {
            status: 200,
            headers: {
              "Cache-Control": "no-store",
              "X-Translation-Cache":
                existingAfter?.status === "ready" ? "hit" : "pending",
            },
          }
        );
      }
      claimUpdatedAt = nowIso;
    }
  }
  if (!claimUpdatedAt) {
    return coordinatorResult(
      { error: "translation_claim_not_owned" },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const { overlay, note, meta } =
      await resolveDictionaryMeaningTranslation(translator, meaningRequest);
    const providerUsed = meta.providerUsed ?? null;
    const usedFallback = meta.usedFallback ?? false;
    const primaryFailure = meta.primaryFailure ?? null;

    const used =
      providerUsed === "deepl" || providerUsed === "openai" || providerUsed === "gemini"
        ? (providerUsed as TranslationProviderName)
        : provider;
    const overlayWithMeta = attachOverlayMeta(overlay, {
      providerSelected: provider,
      providerUsed: used,
      usedFallback,
      primaryFailure,
      promptFingerprint: getDictionaryMeaningPromptFingerprint(used),
      translatedPaths: dictionaryMeaningTranslatedPaths(meaningRequest),
    });

    const { error: updateError } =
      await updateOwnedDictionaryMeaningTranslation(
        supabase,
        {
          wordEntryId,
          targetLanguageCode: dbLang,
          provider,
          sourceFingerprint: fingerprint,
          claimUpdatedAt,
        },
        {
        status: "ready",
        overlay: overlayWithMeta,
        note,
        source_fingerprint: fingerprint,
        source_content_revision: sourceContentRevision,
        translation_policy_version: currentTranslationPolicyVersion,
        provider_revision: getDictionaryMeaningPromptFingerprint(used),
        error_message: null,
        updated_at: new Date().toISOString(),
        },
      );

    if (updateError) {
      return coordinatorResult(
        { error: updateError.message },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return coordinatorResult(
      {
        status: "ready" as const,
        overlay: overlayWithMeta,
        note,
        ...(debug
          ? {
              debug: {
                dbLang,
                targetLang,
                translation: {
                  providerSelected: provider,
                  providerUsed: used,
                  usedFallback,
                  primaryFailure,
                  providerEnv: config.provider,
                  fallbackEnv: config.fallback ?? null,
                  hasKeys: {
                    openai: Boolean(config.apiKeys.openai),
                    deepl: Boolean(config.apiKeys.deepl),
                    gemini: Boolean(config.apiKeys.gemini),
                  },
                },
              },
            }
          : null),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Translation-Cache": "provider",
        },
      }
    );
  } catch (err: unknown) {
    const failure = normalizeTranslationProviderError(err).failure;
    const message = `${failure.code}:${failure.fingerprint}`;

    await updateOwnedDictionaryMeaningTranslation(
      supabase,
      {
        wordEntryId,
        targetLanguageCode: dbLang,
        provider,
        sourceFingerprint: fingerprint,
        claimUpdatedAt,
      },
      {
        status: "failed",
        source_fingerprint: fingerprint,
        source_content_revision: sourceContentRevision,
        translation_policy_version: currentTranslationPolicyVersion,
        provider_revision: selectedProviderRevision,
        error_message: message,
        updated_at: new Date().toISOString(),
      },
    );

    return coordinatorResult(
      {
        status: "failed" as const,
        error: message,
        ...(debug
          ? {
              debug: {
                dbLang,
                targetLang,
                translation: {
                  providerSelected: provider,
                  providerEnv: config.provider,
                  fallbackEnv: config.fallback ?? null,
                  hasKeys: {
                    openai: Boolean(config.apiKeys.openai),
                    deepl: Boolean(config.apiKeys.deepl),
                    gemini: Boolean(config.apiKeys.gemini),
                  },
                },
              },
            }
          : null),
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
          "X-Translation-Cache": "provider",
        },
      }
    );
  }
}
