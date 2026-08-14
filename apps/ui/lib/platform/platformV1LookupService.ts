import type { AuthenticatedSupabase, ServiceSupabase } from "./serverSupabase";
import {
  contentFingerprint,
  normalizeDictionaryContent,
  verifyDictionaryContentAudioLinks,
} from "./projections/dictionaryContent";
import {
  buildCardCapability,
  buildProgressSummary,
  dictionaryCanBeEditedByUser,
  dictionarySummaryFromLookupPayload,
  lookupMatchedForm,
  lookupMatchRelation,
  readLookupUserState,
  type DictionaryLookupPayload,
  type PlatformUserCardStatePayload,
} from "./lookupService";
import {
  resolveLookupTranslationContext,
  type LookupTranslationArtifact,
} from "./translationService";
import {
  asRecord,
  type PlatformAction,
  type PlatformOperationResult,
} from "./platformApiContracts";
import {
  formatPlatformServerTiming,
  measurePlatformTiming,
  rpcWithPlatformLookupTiming,
  type PlatformTimingEntry,
} from "./platformOperationTiming";

export async function performPlatformLookup(
  auth: AuthenticatedSupabase,
  params: {
    query: string;
    includeUserState: boolean;
    includeTranslations?: boolean;
    languageCode?: string | null;
    contextText?: string | null;
    intent?: string | null;
    service?: ServiceSupabase | null;
  },
): Promise<PlatformOperationResult> {
  const {
    query,
    includeUserState,
    includeTranslations = false,
    languageCode = null,
    contextText = null,
  } = params;
  const intent =
    params.intent === "dictionary-lookup" ||
    params.intent === "training-review" ||
    params.intent === "external-click"
      ? params.intent
      : null;
  if (!query) {
    return { payload: { error: "missing_query" }, status: 400 };
  }
  const timings: PlatformTimingEntry[] = [];

  const requestMetadata = {
    languageCode,
    contextText,
    intent,
  };

  const { data, error } = await measurePlatformTiming(timings, "lookup.db", () =>
    rpcWithPlatformLookupTiming(
      auth.supabase,
      "lookup_dictionary_entries_v3",
      {
        p_query: query,
        p_language_code: languageCode,
        p_dictionary_ids: null,
        p_limit: 10,
      },
      "authenticated",
    ),
  );
  const serverTiming = () => formatPlatformServerTiming(timings);

  if (error) {
    return {
      payload: { error: "lookup_failed", detail: error.message ?? String(error) },
      status: 500,
      serverTiming: serverTiming(),
    };
  }

  const rawEntries = asRecord(data).items ?? data;
  const entries = Array.isArray(rawEntries)
    ? (rawEntries as DictionaryLookupPayload[])
    : rawEntries
      ? [rawEntries as DictionaryLookupPayload]
      : [];

  if (entries.length === 0) {
    return {
      payload: {
        query,
        request: requestMetadata,
        items: [],
      },
      status: 200,
      serverTiming: serverTiming(),
    };
  }

  let userStateByEntryId = new Map<
    string,
    Record<string, PlatformUserCardStatePayload>
  >();
  let listMembershipsByEntryId = new Map<string, unknown[]>();
  const translationArtifactsByEntryId = new Map<string, LookupTranslationArtifact>();

  if (includeTranslations && !params.service) {
    return {
      payload: { error: "translation_cache_not_configured" },
      status: 500,
      serverTiming: serverTiming(),
    };
  }

  const translationService = params.service;
  const userStatePromise = includeUserState
    ? measurePlatformTiming(timings, "lookup.user-state", () =>
        readLookupUserState(auth, entries),
      )
    : Promise.resolve(null);
  const translationPromise = includeTranslations && translationService
    ? measurePlatformTiming(timings, "lookup.translation-cache", () =>
        resolveLookupTranslationContext(
          auth,
          translationService,
          entries.map((entry) => entry.id),
        ),
      )
    : Promise.resolve(null);

  const [userState, resolvedTranslations] = await Promise.all([
    userStatePromise,
    translationPromise,
  ]);

  if (userState && !userState.ok) {
    return {
      ...userState.result,
      serverTiming: serverTiming(),
    };
  }
  if (userState) {
    userStateByEntryId = userState.value.userStateByEntryId;
    listMembershipsByEntryId = userState.value.listMembershipsByEntryId;
  }

  if (resolvedTranslations && !resolvedTranslations.ok) {
    return {
      payload: resolvedTranslations.payload,
      status: resolvedTranslations.status,
      serverTiming: serverTiming(),
    };
  }
  if (resolvedTranslations) {
    for (const [entryId, artifact] of resolvedTranslations.artifactsByEntryId) {
      translationArtifactsByEntryId.set(entryId, artifact);
    }
  }

  const items = await measurePlatformTiming(timings, "lookup.projection", async () => Promise.all(entries.map(async (entry) => {
    const availableActions: PlatformAction[] = [
      "record-view",
      "start-learning",
      "mark-known",
      "mark-unknown",
      "review-card",
      "add-to-list",
      "remove-from-list",
      "copy-to-user-dictionary",
      "create-user-entry",
    ];
    if (dictionaryCanBeEditedByUser(entry, auth.user.id)) {
      availableActions.push("update-user-entry", "delete-user-entry");
    }
    const statesByCardType = userStateByEntryId.get(entry.id) ?? {};
    const translation = includeTranslations
      ? translationArtifactsByEntryId.get(entry.id) ?? {
          metadata: { status: "not_available" as const },
        }
      : null;
    const content = await verifyDictionaryContentAudioLinks(
      normalizeDictionaryContent(entry, translation),
    );
    const matchedForm = lookupMatchedForm(entry, query);

    return {
      entry: {
        id: entry.id,
        dictionaryId: entry.dictionary_id ?? null,
        languageCode: entry.language_code ?? null,
        headword: entry.headword,
        meaningId: entry.meaning_id ?? null,
        partOfSpeech: entry.part_of_speech ?? null,
        gender: entry.gender ?? null,
        content,
        contentFingerprint: contentFingerprint(content),
        raw: entry.raw,
        isNt22000: entry.is_nt2_2000 ?? null,
        meaningsCount: entry.meanings_count ?? null,
      },
      dictionary: dictionarySummaryFromLookupPayload(entry),
      ...(includeUserState
        ? {
            userStateByCardType: statesByCardType,
            progressSummary: buildProgressSummary(statesByCardType),
            cardCapabilitiesByType: {
              "word-to-definition": buildCardCapability(
                statesByCardType["word-to-definition"],
              ),
            },
            listMemberships: listMembershipsByEntryId.get(entry.id) ?? [],
          }
        : {}),
      ...(translation ? { translation: translation.metadata } : {}),
      match: {
        queriedForm: query,
        ...(matchedForm ? { matchedForm } : {}),
        relation: lookupMatchRelation(entry, query),
      },
      availableActions,
    };
  })));

  return {
    payload: {
      query,
      request: requestMetadata,
      items,
    },
    status: 200,
    serverTiming: serverTiming(),
  };
}

export async function performPlatformCatalogLookup(
  service: ServiceSupabase,
  params: {
    query: string;
    languageCode?: string | null;
    contextText?: string | null;
    includeTranslations?: boolean;
    intent?: string | null;
  },
): Promise<PlatformOperationResult> {
  const {
    query,
    languageCode = null,
    contextText = null,
    includeTranslations = false,
  } = params;
  const intent =
    params.intent === "dictionary-lookup" ||
    params.intent === "training-review" ||
    params.intent === "external-click"
      ? params.intent
      : null;
  if (!query) {
    return { payload: { error: "missing_query" }, status: 400 };
  }
  const timings: PlatformTimingEntry[] = [];

  const requestMetadata = {
    languageCode,
    contextText,
    intent,
  };

  const { data, error } = await measurePlatformTiming(timings, "lookup.db", () =>
    rpcWithPlatformLookupTiming(
      service.supabase,
      "lookup_public_catalog_entries_v1",
      {
        p_query: query,
        p_language_code: languageCode,
        p_limit: 10,
      },
      "catalog",
    ),
  );
  const serverTiming = () => formatPlatformServerTiming(timings);

  if (error) {
    return {
      payload: {
        error: "catalog_lookup_failed",
        detail: error.message ?? String(error),
      },
      status: 500,
      serverTiming: serverTiming(),
    };
  }

  const payload = asRecord(data);
  if (payload.error === "search_index_not_ready") {
    return {
      payload,
      status: 503,
      serverTiming: serverTiming(),
    };
  }

  const rawEntries = payload.items;
  const entries = Array.isArray(rawEntries)
    ? (rawEntries as unknown as DictionaryLookupPayload[])
    : Array.isArray(data)
    ? (data as unknown as DictionaryLookupPayload[])
    : rawEntries
      ? [rawEntries as unknown as DictionaryLookupPayload]
      : data
      ? [data as unknown as DictionaryLookupPayload]
      : [];

  return {
    payload: {
      query,
      request: requestMetadata,
      items: (await measurePlatformTiming(timings, "lookup.projection", async () =>
        Promise.all(entries.map(async (entry) => {
        const dictionary = Array.isArray(entry.dictionary)
          ? entry.dictionary[0] ?? null
          : entry.dictionary ?? null;
        if (
          dictionary &&
          dictionary.visibility !== "system" &&
          dictionary.visibility !== "public"
        ) {
          return [];
        }
        const translation = includeTranslations
          ? { metadata: { status: "not_available" as const } }
          : null;
        const content = await verifyDictionaryContentAudioLinks(
          normalizeDictionaryContent(entry, translation),
        );
        const matchedForm = lookupMatchedForm(entry, query);

        return [{
          entry: {
            id: entry.id,
            dictionaryId: entry.dictionary_id ?? null,
            languageCode: entry.language_code ?? null,
            headword: entry.headword,
            meaningId: entry.meaning_id ?? null,
            partOfSpeech: entry.part_of_speech ?? null,
            gender: entry.gender ?? null,
            content,
            contentFingerprint: contentFingerprint(content),
            raw: entry.raw,
            isNt22000: entry.is_nt2_2000 ?? null,
            meaningsCount: entry.meanings_count ?? null,
          },
          dictionary: dictionary
            ? {
                id: dictionary.id,
                languageCode: dictionary.language_code,
                slug: dictionary.slug,
                name: dictionary.name,
                kind: dictionary.kind,
                visibility: dictionary.visibility,
                schemaKey: dictionary.schema_key,
                schemaVersion: dictionary.schema_version,
                isEditable: dictionary.is_editable ?? null,
              }
            : null,
          ...(translation ? { translation: translation.metadata } : {}),
          match: {
            queriedForm: query,
            ...(matchedForm ? { matchedForm } : {}),
            relation: lookupMatchRelation(entry, query),
          },
        }];
      })),
      )).flat(),
    },
    status: 200,
    serverTiming: serverTiming(),
  };
}

