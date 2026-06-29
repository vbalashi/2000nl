import type { AuthenticatedSupabase, ServiceSupabase } from "./serverSupabase";
import { validatePlatformActionEnvelope } from "./actionService";
import {
  contentFingerprint,
  normalizeDictionaryContent,
  verifyDictionaryContentAudioLinks,
} from "./projections/dictionaryContent";
import {
  performProvenanceAwareCardAction,
  recordReview,
} from "./provenanceService";
import {
  mapUserListRpcPayload,
  type EntryListMembership,
} from "./listService";
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
  type LookupTranslationMetadata,
} from "./translationService";
import {
  createUserDictionaryEntry,
  deleteUserDictionaryEntry,
  mapUserEntryRpcError,
  updateUserDictionaryEntry,
} from "./userDictionaryService";
import type { ListCardPolicy, ReviewResult, TrainingMode } from "@/lib/types";

const TRAINING_MODES = new Set<TrainingMode>([
  "word-to-definition",
  "definition-to-word",
  "listen-recognize",
  "listen-type",
]);
const REVIEW_RESULTS = new Set<ReviewResult>([
  "fail",
  "hard",
  "success",
  "easy",
  "freeze",
  "hide",
]);

function strictLookupRoutesEnabled() {
  const value = process.env.PLATFORM_STRICT_LOOKUP_ROUTES;
  return value !== "0" && value !== "false";
}

async function rpcWithLookupTiming(
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => any;
  },
  name: string,
  args: Record<string, unknown>,
  scope: "authenticated" | "catalog",
) {
  const startedAt = Date.now();
  const result = await supabase.rpc(name, args);
  if (process.env.PLATFORM_LOOKUP_LATENCY_LOGS === "1") {
    console.info("[platform.lookup]", {
      scope,
      rpc: name,
      elapsedMs: Date.now() - startedAt,
      ok: !result?.error,
    });
  }
  return result;
}

export type PlatformAction =
  | "fetch-entry"
  | "record-view"
  | "review-card"
  | "mark-known"
  | "mark-unknown"
  | "start-learning"
  | "add-to-list"
  | "remove-from-list"
  | "copy-to-user-dictionary"
  | "create-user-entry"
  | "update-user-entry"
  | "delete-user-entry"
  | "create-user-list"
  | "update-user-list"
  | "delete-user-list";

export type PlatformActionBody = {
  action?: unknown;
  entryId?: unknown;
  cardTypeId?: unknown;
  result?: unknown;
  turnId?: unknown;
  clientEventId?: unknown;
  sourceContext?: unknown;
  listId?: unknown;
  targetDictionaryId?: unknown;
  dictionaryId?: unknown;
  entry?: unknown;
  overrides?: unknown;
  name?: unknown;
  description?: unknown;
  languageCode?: unknown;
  primaryLanguageCode?: unknown;
  defaultScenarioId?: unknown;
  cardPolicy?: unknown;
  cardTypeIds?: unknown;
};

export type PlatformOperationResult = {
  payload: unknown;
  status: number;
  serverTiming?: string;
};

type TimingEntry = {
  name: string;
  durationMs: number;
};

function formatServerTiming(entries: TimingEntry[]) {
  return entries
    .map((entry) => `${entry.name};dur=${Math.max(0, entry.durationMs).toFixed(1)}`)
    .join(", ");
}

async function measureTiming<T>(
  timings: TimingEntry[],
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    timings.push({ name, durationMs: performance.now() - startedAt });
  }
}

function measureProjection<T>(
  timings: TimingEntry[],
  name: string,
  fn: () => T,
): T {
  const startedAt = performance.now();
  try {
    return fn();
  } finally {
    timings.push({ name, durationMs: performance.now() - startedAt });
  }
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asTrainingMode(value: unknown): TrainingMode | null {
  const mode = asString(value);
  return mode && TRAINING_MODES.has(mode as TrainingMode)
    ? (mode as TrainingMode)
    : null;
}

function asReviewResult(value: unknown): ReviewResult | null {
  const result = asString(value);
  return result && REVIEW_RESULTS.has(result as ReviewResult)
    ? (result as ReviewResult)
    : null;
}

function asUuid(value: unknown): string | null {
  const uuid = asString(value);
  return uuid &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)
    ? uuid
    : null;
}

function asListCardPolicy(value: unknown): ListCardPolicy | null {
  const policy = asString(value);
  return policy && ["inherit", "prefer", "restrict"].includes(policy)
    ? (policy as ListCardPolicy)
    : null;
}

function asOptionalStringArray(
  value: unknown,
): { ok: true; value: string[] | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (!Array.isArray(value)) return { ok: false };
  if (value.some((item) => !asString(item))) return { ok: false };
  const values = Array.from(
    new Set(
      value
        .map((item) => asString(item))
        .filter((item): item is string => Boolean(item)),
    ),
  );
  return { ok: true, value: values.length ? values : null };
}

function hasOwnBodyField(body: PlatformActionBody, field: keyof PlatformActionBody) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

async function assertEntryReadable(
  supabase: any,
  entryId: string,
): Promise<true | { error: string; detail?: string }> {
  const { data: entry, error } = await supabase.rpc(
    "fetch_dictionary_entry_by_id_gated",
    {
      p_entry_id: entryId,
    },
  );

  if (error) {
    return { error: "entry_lookup_failed", detail: error.message ?? String(error) };
  }
  if (!entry) {
    return { error: "entry_not_accessible" };
  }

  return true;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

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
  const timings: TimingEntry[] = [];

  const requestMetadata = {
    languageCode,
    contextText,
    intent,
  };

  const useStrictLookup = strictLookupRoutesEnabled();
  const usesSearchSemantics =
    !useStrictLookup &&
    (intent === "external-click" || Boolean(languageCode) || Boolean(contextText));
  const { data, error } = await measureTiming(timings, "lookup.db", () =>
    useStrictLookup
      ? rpcWithLookupTiming(
          auth.supabase,
          "lookup_dictionary_entries_v3",
          {
            p_query: query,
            p_language_code: languageCode,
            p_dictionary_ids: null,
            p_limit: 10,
          },
          "authenticated",
        )
    : usesSearchSemantics
      ? rpcWithLookupTiming(auth.supabase, "search_word_entries_gated", {
        p_query: query,
        p_part_of_speech: null,
        p_is_nt2: null,
        p_filter_frozen: null,
        p_filter_hidden: null,
        p_page: 1,
        p_page_size: 10,
        p_language_code: languageCode,
        p_dictionary_ids: null,
      }, "authenticated")
      : rpcWithLookupTiming(auth.supabase, "fetch_dictionary_entry_gated", {
        p_headword: query,
      }, "authenticated"),
  );
  const serverTiming = () => formatServerTiming(timings);

  if (error) {
    return {
      payload: { error: "lookup_failed", detail: error.message ?? String(error) },
      status: 500,
      serverTiming: serverTiming(),
    };
  }

  const rawEntries = useStrictLookup
    ? (asRecord(data).items ?? data)
    : usesSearchSemantics
      ? asRecord(data).items
      : data;
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
    ? measureTiming(timings, "lookup.user-state", () =>
        readLookupUserState(auth, entries),
      )
    : Promise.resolve(null);
  const translationPromise = includeTranslations && translationService
    ? measureTiming(timings, "lookup.translation-cache", () =>
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

  const items = await measureTiming(timings, "lookup.projection", async () => Promise.all(entries.map(async (entry) => {
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
  const timings: TimingEntry[] = [];

  const requestMetadata = {
    languageCode,
    contextText,
    intent,
  };

  const useStrictLookup = strictLookupRoutesEnabled();
  const { data, error } = await measureTiming(timings, "lookup.db", () =>
    useStrictLookup
      ? rpcWithLookupTiming(
          service.supabase,
          "lookup_public_catalog_entries_v1",
          {
            p_query: query,
            p_language_code: languageCode,
            p_limit: 10,
          },
          "catalog",
        )
      : rpcWithLookupTiming(
          service.supabase,
          "search_public_catalog_entries",
          {
            p_query: query,
            p_language_code: languageCode,
            p_page: 1,
            p_page_size: 10,
          },
          "catalog",
        ),
  );
  const serverTiming = () => formatServerTiming(timings);

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
      items: (await measureTiming(timings, "lookup.projection", async () =>
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

export async function performPlatformSearch(
  auth: AuthenticatedSupabase,
  params: {
    query: string;
    languageCode?: string | null;
    dictionaryIds?: string[] | null;
    group?: string | null;
    limit?: number | null;
    cursor?: string | null;
  },
): Promise<PlatformOperationResult> {
  const {
    query,
    languageCode = null,
    dictionaryIds = null,
    group = null,
    limit = 6,
    cursor = null,
  } = params;
  if (!query) {
    return { payload: { error: "missing_query" }, status: 400 };
  }
  const timings: TimingEntry[] = [];
  const { data, error } = await measureTiming(timings, "search.db", async () =>
    await auth.supabase.rpc("search_dictionary_groups_v1", {
      p_query: query,
      p_language_code: languageCode,
      p_dictionary_ids: dictionaryIds,
      p_group: group,
      p_limit: limit,
      p_cursor: cursor,
    }),
  );
  const serverTiming = () => formatServerTiming(timings);

  if (error) {
    return {
      payload: { error: "search_failed", detail: error.message ?? String(error) },
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

  return {
    payload: data,
    status: 200,
    serverTiming: serverTiming(),
  };
}

export async function performPlatformCatalogSearch(
  service: ServiceSupabase,
  params: {
    query: string;
    languageCode?: string | null;
    group?: string | null;
    limit?: number | null;
    cursor?: string | null;
  },
): Promise<PlatformOperationResult> {
  const {
    query,
    languageCode = null,
    group = null,
    limit = 6,
    cursor = null,
  } = params;
  if (!query) {
    return { payload: { error: "missing_query" }, status: 400 };
  }
  const timings: TimingEntry[] = [];
  const { data, error } = await measureTiming(timings, "search.db", async () =>
    await service.supabase.rpc("search_public_dictionary_groups_v1", {
      p_query: query,
      p_language_code: languageCode,
      p_group: group,
      p_limit: limit,
      p_cursor: cursor,
    }),
  );
  const serverTiming = () => formatServerTiming(timings);

  if (error) {
    return {
      payload: {
        error: "catalog_search_failed",
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

  return {
    payload: data,
    status: 200,
    serverTiming: serverTiming(),
  };
}

export async function performPlatformAction(
  auth: AuthenticatedSupabase,
  body: PlatformActionBody | null,
): Promise<PlatformOperationResult> {
  const validated = validatePlatformActionEnvelope(auth, body);
  if (!validated.ok) {
    return validated.result;
  }
  const { action, entryId, clientEventId, sourceContext } = validated.value;

  if (action === "fetch-entry") {
    if (!entryId) {
      return { payload: { error: "missing_entry_id" }, status: 400 };
    }

    const { data, error } = await auth.supabase.rpc(
      "fetch_dictionary_entry_by_id_gated",
      {
        p_entry_id: entryId,
      },
    );

    if (error) {
      return {
        payload: {
          error: "entry_lookup_failed",
          detail: error.message ?? String(error),
        },
        status: 500,
      };
    }
    if (!data) {
      return { payload: { error: "entry_not_accessible" }, status: 404 };
    }

    return {
      payload: {
        ok: true,
        action,
        entryId,
        entry: data,
      },
      status: 200,
    };
  }

  if (action === "create-user-list") {
    const name = asString(body?.name);
    if (!name) {
      return { payload: { error: "missing_list_name" }, status: 400 };
    }

    const languageCode = asString(body?.languageCode) ?? "nl";
    if (body?.cardPolicy !== undefined && !asListCardPolicy(body.cardPolicy)) {
      return { payload: { error: "invalid_user_list" }, status: 400 };
    }
    const cardTypeIds = asOptionalStringArray(body?.cardTypeIds);
    if (!cardTypeIds.ok) {
      return { payload: { error: "invalid_user_list" }, status: 400 };
    }
    const cardPolicy = asListCardPolicy(body?.cardPolicy) ?? "inherit";
    const { data, error } = await auth.supabase.rpc("create_user_word_list", {
      p_user_id: auth.user.id,
      p_name: name,
      p_description: asString(body?.description),
      p_language_code: languageCode,
      p_primary_language_code: asString(body?.primaryLanguageCode) ?? languageCode,
      p_default_scenario_id: asString(body?.defaultScenarioId),
      p_card_policy: cardPolicy,
      p_card_type_ids: cardTypeIds.value,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("duplicate_user_list")) {
        return { payload: { error: "duplicate_user_list", detail }, status: 409 };
      }
      if (
        detail.includes("invalid_list_name") ||
        detail.includes("language_not_found") ||
        detail.includes("invalid_card_policy") ||
        detail.includes("scenario_not_found") ||
        detail.includes("invalid_card_type_ids")
      ) {
        return { payload: { error: "invalid_user_list", detail }, status: 400 };
      }
      return { payload: { error: "create_user_list_failed", detail }, status: 500 };
    }

    return {
      payload: {
        ok: true,
        action,
        listId: data?.id ?? null,
        list: mapUserListRpcPayload(data),
      },
      status: 200,
    };
  }

  if (action === "delete-user-list") {
    const listId = asString(body?.listId);
    if (!listId) {
      return { payload: { error: "missing_list_id" }, status: 400 };
    }

    const { error } = await auth.supabase.rpc("delete_user_word_list", {
      p_user_id: auth.user.id,
      p_list_id: listId,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("list_not_found")) {
        return { payload: { error: "list_not_found" }, status: 404 };
      }
      return { payload: { error: "delete_user_list_failed", detail }, status: 500 };
    }

    return { payload: { ok: true, action, listId }, status: 200 };
  }

  if (action === "update-user-list") {
    const listId = asString(body?.listId);
    if (!listId) {
      return { payload: { error: "missing_list_id" }, status: 400 };
    }

    const languageCode = asString(body?.languageCode);
    if (body?.cardPolicy !== undefined && !asListCardPolicy(body.cardPolicy)) {
      return { payload: { error: "invalid_user_list" }, status: 400 };
    }
    const cardTypeIds = asOptionalStringArray(body?.cardTypeIds);
    if (!cardTypeIds.ok) {
      return { payload: { error: "invalid_user_list" }, status: 400 };
    }
    const cardPolicy = asListCardPolicy(body?.cardPolicy);
    const { data, error } = await auth.supabase.rpc("update_user_word_list", {
      p_user_id: auth.user.id,
      p_list_id: listId,
      p_name: asString(body?.name),
      p_description:
        typeof body?.description === "string" ? body.description : null,
      p_language_code: languageCode,
      p_primary_language_code:
        asString(body?.primaryLanguageCode) ?? languageCode,
      p_default_scenario_id: asString(body?.defaultScenarioId),
      p_card_policy: cardPolicy,
      p_card_type_ids: cardTypeIds.value,
      p_clear_default_scenario:
        hasOwnBodyField(body ?? {}, "defaultScenarioId") &&
        body?.defaultScenarioId === null,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("list_not_found")) {
        return { payload: { error: "list_not_found" }, status: 404 };
      }
      if (detail.includes("duplicate_user_list")) {
        return { payload: { error: "duplicate_user_list", detail }, status: 409 };
      }
      if (
        detail.includes("invalid_list_name") ||
        detail.includes("language_not_found") ||
        detail.includes("invalid_card_policy") ||
        detail.includes("scenario_not_found") ||
        detail.includes("invalid_card_type_ids")
      ) {
        return { payload: { error: "invalid_user_list", detail }, status: 400 };
      }
      return { payload: { error: "update_user_list_failed", detail }, status: 500 };
    }

    return {
      payload: {
        ok: true,
        action,
        listId,
        list: mapUserListRpcPayload(data),
      },
      status: 200,
    };
  }

  if (action === "create-user-entry") {
    const dictionaryId = asString(body?.dictionaryId);
    const entry =
      body?.entry && typeof body.entry === "object" && !Array.isArray(body.entry)
        ? (body.entry as Record<string, unknown>)
        : null;
    if (!entry) {
      return { payload: { error: "missing_entry_payload" }, status: 400 };
    }

    return createUserDictionaryEntry(auth, { action, dictionaryId, entry });
  }

  if (!entryId) {
    return { payload: { error: "missing_entry_id" }, status: 400 };
  }

  if (action === "update-user-entry") {
    const entry =
      body?.entry && typeof body.entry === "object" && !Array.isArray(body.entry)
        ? (body.entry as Record<string, unknown>)
        : null;
    if (!entry) {
      return { payload: { error: "missing_entry_payload" }, status: 400 };
    }

    return updateUserDictionaryEntry(auth, { action, entryId, entry });
  }

  if (action === "delete-user-entry") {
    return deleteUserDictionaryEntry(auth, { action, entryId });
  }

  if (action === "remove-from-list") {
    const listId = asString(body?.listId);
    if (!listId) {
      return { payload: { error: "missing_list_id" }, status: 400 };
    }

    const { error } = await auth.supabase.rpc("remove_entries_from_user_list", {
      p_user_id: auth.user.id,
      p_list_id: listId,
      p_entry_ids: [entryId],
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("list_not_found")) {
        return { payload: { error: "list_not_found" }, status: 404 };
      }
      return { payload: { error: "remove_from_list_failed", detail }, status: 500 };
    }

    return { payload: { ok: true, action, entryId, listId }, status: 200 };
  }

  const readable = await assertEntryReadable(auth.supabase, entryId);
  if (readable !== true) {
    const status =
      readable.error === "entry_not_found"
        ? 404
        : readable.error === "entry_lookup_failed"
          ? 500
          : 403;
    return { payload: readable, status };
  }

  if (action === "add-to-list") {
    const listId = asString(body?.listId);
    if (!listId) {
      return { payload: { error: "missing_list_id" }, status: 400 };
    }

    const { error } = await auth.supabase.rpc("add_entry_to_user_list", {
      p_user_id: auth.user.id,
      p_list_id: listId,
      p_entry_id: entryId,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("list_not_found")) {
        return { payload: { error: "list_not_found" }, status: 404 };
      }
      if (detail.includes("entry_not_found")) {
        return { payload: { error: "entry_not_found" }, status: 404 };
      }
      if (detail.includes("entry_not_accessible")) {
        return { payload: { error: "entry_not_accessible" }, status: 403 };
      }
      return { payload: { error: "add_to_list_failed", detail }, status: 500 };
    }

    return { payload: { ok: true, action, entryId, listId }, status: 200 };
  }

  if (action === "copy-to-user-dictionary") {
    const targetDictionaryId = asString(body?.targetDictionaryId);
    const overrides =
      body?.overrides && typeof body.overrides === "object" && !Array.isArray(body.overrides)
        ? body.overrides
        : {};

    const { data, error } = await auth.supabase.rpc("copy_entry_to_user_dictionary", {
      p_user_id: auth.user.id,
      p_source_entry_id: entryId,
      p_target_dictionary_id: targetDictionaryId,
      p_overrides: overrides,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("entry_not_found")) {
        return { payload: { error: "entry_not_found" }, status: 404 };
      }
      if (detail.includes("entry_not_accessible")) {
        return { payload: { error: "entry_not_accessible" }, status: 403 };
      }
      if (detail.includes("target_dictionary_not_editable")) {
        return { payload: { error: "target_dictionary_not_editable" }, status: 403 };
      }
      if (
        detail.includes("invalid_user_entry") ||
        detail.includes("language_not_found") ||
        detail.includes("language_mismatch")
      ) {
        return { payload: { error: "invalid_user_entry", detail }, status: 400 };
      }
      return {
        payload: { error: "copy_to_user_dictionary_failed", detail },
        status: 500,
      };
    }

    return {
      payload: {
        ok: true,
        action,
        entryId,
        copiedEntryId: data,
        targetDictionaryId: targetDictionaryId ?? null,
      },
      status: 200,
    };
  }

  const mode = asTrainingMode(body?.cardTypeId);
  if (!mode) {
    return { payload: { error: "missing_or_invalid_card_type_id" }, status: 400 };
  }

  if (action === "record-view" || action === "start-learning") {
    if (clientEventId) {
      const { data, error } = await performProvenanceAwareCardAction(auth, {
        entryId,
        mode,
        action,
        clientEventId,
        sourceContext,
      });

      if (error) {
        const detail = error.message ?? String(error);
        if (detail.includes("platform_action_idempotency_conflict")) {
          return { payload: { error: "idempotency_conflict", detail }, status: 409 };
        }
        return {
          payload: { error: `${action}_failed`, detail },
          status: 500,
        };
      }
      return {
        payload: {
          ok: true,
          action,
          entryId,
          cardTypeId: mode,
          clientEventId,
          provenance: data ?? null,
        },
        status: 200,
      };
    }

    const { error } =
      action === "start-learning"
        ? await auth.supabase.rpc("start_learning_entry_card", {
            p_user_id: auth.user.id,
            p_entry_id: entryId,
            p_card_type_id: mode,
          })
        : await auth.supabase.rpc("record_card_view", {
            p_user_id: auth.user.id,
            p_entry_id: entryId,
            p_card_type_id: mode,
          });

    if (error) {
      return {
        payload: { error: `${action}_failed`, detail: error.message ?? String(error) },
        status: 500,
      };
    }
    return { payload: { ok: true, action, entryId, cardTypeId: mode }, status: 200 };
  }

  const result =
    action === "mark-unknown"
      ? "fail"
      : action === "mark-known"
        ? "easy"
        : asReviewResult(body?.result);
  if (!result) {
    return { payload: { error: "missing_or_invalid_result" }, status: 400 };
  }

  const turnId = asString(body?.turnId);
  const provenanceTurnId = clientEventId ? asUuid(body?.turnId) ?? asUuid(clientEventId) : null;
  if (clientEventId && body?.turnId !== undefined && !asUuid(body.turnId)) {
    return { payload: { error: "invalid_turn_id" }, status: 400 };
  }

  if (clientEventId) {
    const { data, error } = await performProvenanceAwareCardAction(auth, {
      entryId,
      mode,
      action,
      result,
      turnId: provenanceTurnId,
      clientEventId,
      sourceContext,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("platform_action_idempotency_conflict")) {
        return { payload: { error: "idempotency_conflict", detail }, status: 409 };
      }
      if (detail.includes("platform_review_turn_already_consumed")) {
        return {
          payload: { error: "review_turn_already_consumed", detail },
          status: 409,
        };
      }
      return {
        payload: { error: `${action}_failed`, detail },
        status: 500,
      };
    }

    return {
      payload: {
        ok: true,
        action,
        entryId,
        cardTypeId: mode,
        result,
        turnId: provenanceTurnId,
        clientEventId,
        provenance: data ?? null,
      },
      status: 200,
    };
  }

  const { error } = await recordReview(auth, {
    entryId,
    mode,
    result,
    turnId,
  });

  if (error) {
    return {
      payload: { error: `${action}_failed`, detail: error.message ?? String(error) },
      status: 500,
    };
  }

  return {
    payload: {
      ok: true,
      action,
      entryId,
      cardTypeId: mode,
      result,
      turnId: turnId ?? null,
    },
    status: 200,
  };
}
