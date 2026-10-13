import type { AuthenticatedSupabase, ServiceSupabase } from "./serverSupabase";
import type { DictionaryLookupPayload } from "./lookupService";
import { dictionaryMeaningTranslationIdentity } from "../translation/dictionaryMeaningTranslationIdentity";
import { dictionaryMeaningTranslationCoverage } from "../translation/dictionaryMeaningTranslationReadiness";
import {
  sanitizeStoredTranslationError,
  sanitizeTranslationOverlay,
} from "../translation/translationArtifactSafety";

type TranslationCacheRow = {
  id?: string | null;
  word_entry_id: string;
  target_lang: string;
  provider: string;
  status: "pending" | "ready" | "failed";
  overlay: Record<string, unknown> | null;
  note?: string | null;
  source_fingerprint?: string | null;
  source_content_revision?: string | null;
  translation_policy_version?: string | null;
  error_message?: string | null;
};

export type LookupTranslationMetadata = {
  status: "ready" | "pending" | "failed" | "not_requested" | "not_available";
  targetLanguageCode?: string;
  translationId?: string;
  translationPolicyVersion?: string;
  error?: {
    code: string;
    message?: string;
  };
};

export type LookupTranslationArtifact = {
  metadata: LookupTranslationMetadata;
  overlay?: Record<string, unknown> | null;
};

export async function resolveLookupTranslationContext(
  auth: AuthenticatedSupabase,
  service: ServiceSupabase,
  entries: DictionaryLookupPayload[],
): Promise<
  | {
      ok: true;
      targetLanguageCode: string | null;
      artifactsByEntryId: Map<string, LookupTranslationArtifact>;
    }
  | { ok: false; payload: unknown; status: number }
> {
  const entryIds = entries.map(entry => entry.id);
  const { data: settings, error: settingsError } = await auth.supabase
    .from("user_settings")
    .select("translation_lang")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (settingsError) {
    return {
      ok: false,
      payload: {
        error: "translation_preference_failed",
        detail: settingsError.message ?? String(settingsError),
      },
      status: 500,
    };
  }

  const targetLanguageCode = settings?.translation_lang ?? "en";
  if (targetLanguageCode === "off") {
    return {
      ok: true,
      targetLanguageCode: null,
      artifactsByEntryId: new Map(
        entryIds.map((entryId) => [
          entryId,
          { metadata: { status: "not_available" as const } },
        ]),
      ),
    };
  }

  const provider = normalizeTranslationProvider(process.env.TRANSLATION_PROVIDER);
  const dbLang = normalizeLangForDb(targetLanguageCode);
  const { data: rows, error: translationError } = await service.supabase
    .from("word_entry_translations")
    .select(
      "id,word_entry_id,target_lang,provider,status,overlay,note,source_fingerprint,source_content_revision,translation_policy_version,error_message",
    )
    .in("word_entry_id", entryIds)
    .eq("target_lang", dbLang)
    .eq("provider", provider);

  if (translationError) {
    return {
      ok: false,
      payload: {
        error: "translation_cache_failed",
        detail: translationError.message ?? String(translationError),
      },
      status: 500,
    };
  }

  const rowsByEntryId = new Map<string, TranslationCacheRow>();
  for (const row of Array.isArray(rows) ? (rows as TranslationCacheRow[]) : []) {
    if (row?.word_entry_id) rowsByEntryId.set(row.word_entry_id, row);
  }

  const artifactsByEntryId = new Map<string, LookupTranslationArtifact>();
  for (const entryId of entryIds) {
    const row = rowsByEntryId.get(entryId);
    if (!row) {
      artifactsByEntryId.set(entryId, {
        metadata: {
          status: "not_available",
          targetLanguageCode,
        },
      });
      continue;
    }

    const translationId = asString(row.id ?? undefined) ?? undefined;
    const base = {
      targetLanguageCode,
      ...(translationId ? { translationId } : {}),
      ...(row.source_fingerprint
        ? { translationPolicyVersion: row.source_fingerprint }
        : {}),
    };
    const entry = entries.find(entry => entry.id === entryId)!;
    const identity = await dictionaryMeaningTranslationIdentity({ wordEntryId: entryId, word: entry, dbLang, provider });
    const overlay = sanitizeTranslationOverlay(row.overlay);
    if (row.source_content_revision !== identity.sourceContentRevision ||
        row.translation_policy_version !== identity.policyVersion ||
        (row.status === "ready" && !dictionaryMeaningTranslationCoverage(identity.request, overlay).requestComplete)) {
      artifactsByEntryId.set(entryId, { metadata: { ...base, status: "not_available", error: { code: "translation_refresh_required" } } });
      continue;
    }
    if (row.status === "ready" && overlay) {
      artifactsByEntryId.set(entryId, {
        metadata: {
          status: "ready",
          ...base,
        },
        overlay,
      });
      continue;
    }
    if (row.status === "pending") {
      artifactsByEntryId.set(entryId, {
        metadata: {
          status: "pending",
          ...base,
        },
      });
      continue;
    }
    const safeErrorMessage = sanitizeStoredTranslationError(row.error_message);
    artifactsByEntryId.set(entryId, {
      metadata: {
        status: "failed",
        ...base,
        error: {
          code: "translation_failed",
          ...(safeErrorMessage ? { message: safeErrorMessage } : {}),
        },
      },
    });
  }

  return { ok: true, targetLanguageCode, artifactsByEntryId };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeLangForDb(lang: string) {
  return lang.trim().replace("_", "-").toLowerCase();
}

function normalizeTranslationProvider(value: string | undefined | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "deepl" || normalized === "openai" || normalized === "gemini"
    ? normalized
    : "openai";
}
