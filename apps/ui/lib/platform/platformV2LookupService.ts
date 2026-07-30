import crypto from "node:crypto";
import type {
  CardTypeId,
  DictionaryLookupResult,
  DictionarySummary,
  LookupIntent,
} from "../../../../packages/shared/types/platform";
import type {
  PlatformLookupV2Request,
  PlatformLookupV2Response,
} from "../../../../packages/shared/types/platformV2";
import {
  normalizeDictionaryContent,
  verifyDictionaryContentAudioLinks,
} from "./projections/dictionaryContent";
import {
  projectPlatformLookupV2,
  PlatformV2ProjectionError,
  type PlatformContentNodeBindingV2Input,
  type PlatformLookupV2ProjectionEntry,
  type ProjectionCardState,
} from "./projections/senseCardV2";
import type {
  AuthenticatedSupabase,
  ServiceSupabase,
} from "./serverSupabase";
import type { DictionaryLookupPayload } from "./lookupService";
import { resolvePlatformV2Translations } from "./platformV2TranslationService";
import {
  extractPlatformV2ContentSections,
  platformV2ContentRevision,
  platformV2CrossReferenceQuery,
  platformV2HeaderEvidence,
  projectPlatformV2WordDetails,
} from "./platformV2RichContent";

const LOOKUP_GROUP_PAGE_SIZE = 10;
const LOOKUP_GROUP_ENTRY_SAFETY_BOUND = 50;

export type PlatformV2LookupOperationResult = {
  payload: unknown;
  status: number;
  serverTiming?: string;
};

type PlatformV2IdentityEntry = {
  entryId: string;
  headwordGroupId: string;
  meaningOrdinal: number | null;
  contentNodeBindings: PlatformContentNodeBindingV2Input[];
};

type PlatformV2LookupContext =
  | {
      kind: "authenticated";
      auth: AuthenticatedSupabase;
      service: ServiceSupabase;
    }
  | {
      kind: "catalog";
      service: ServiceSupabase;
    };

type RpcResult = {
  data: unknown;
  error: unknown;
};

export async function performPlatformV2Lookup(
  context: PlatformV2LookupContext,
  request: PlatformLookupV2Request,
): Promise<PlatformV2LookupOperationResult> {
  const timings: Array<{ name: string; durationMs: number }> = [];
  const serverTiming = () =>
    timings
      .map(
        (entry) =>
          `${entry.name};dur=${Math.max(0, entry.durationMs).toFixed(1)}`,
      )
      .join(", ");
  const query = request.query.trim();
  const intent = validIntent(request.intent);

  if (!query) {
    return { payload: { error: "missing_query" }, status: 400 };
  }
  if (!request.cardTypeId.trim()) {
    return { payload: { error: "missing_card_type_id" }, status: 400 };
  }
  const lookupResult = await measure<RpcResult>(
    timings,
    "lookup.db",
    async () =>
      await context.service.supabase.rpc("lookup_platform_v2_entries", {
        p_user_id:
          context.kind === "authenticated" ? context.auth.user.id : null,
        p_catalog: context.kind === "catalog",
        p_query: query,
        p_language_code: request.contentLanguageCode ?? null,
        p_cursor: request.cursor ?? null,
        p_group_limit: LOOKUP_GROUP_PAGE_SIZE,
        p_group_entry_bound: LOOKUP_GROUP_ENTRY_SAFETY_BOUND,
      }),
  );

  if (lookupResult.error) {
    return {
      payload: {
        error:
          context.kind === "authenticated"
            ? "lookup_failed"
            : "catalog_lookup_failed",
        detail: errorMessage(lookupResult.error),
      },
      status: 500,
      serverTiming: serverTiming(),
    };
  }

  const lookupPayload = asRecord(lookupResult.data);
  if (lookupPayload.error === "search_index_not_ready") {
    return {
      payload: lookupPayload,
      status: 503,
      serverTiming: serverTiming(),
    };
  }
  if (lookupPayload.error === "invalid_cursor") {
    return {
      payload: { error: "invalid_cursor" },
      status: 400,
      serverTiming: serverTiming(),
    };
  }
  if (lookupPayload.error === "group-too-large") {
    return {
      payload: lookupPayload,
      status: 422,
      serverTiming: serverTiming(),
    };
  }
  if (lookupPayload.error === "presentation_identity_incomplete") {
    return {
      payload: lookupPayload,
      status: 409,
      serverTiming: serverTiming(),
    };
  }
  if (lookupPayload.error) {
    return {
      payload: lookupPayload,
      status: 500,
      serverTiming: serverTiming(),
    };
  }
  const entries = lookupEntries(lookupResult.data);
  const page = lookupPage(lookupPayload);

  const responseRequest: PlatformLookupV2Response["request"] = {
    contentLanguageCode: request.contentLanguageCode ?? null,
    translationTargetLanguageCode:
      request.translationTargetLanguageCode ?? null,
    cardTypeId: request.cardTypeId,
    intent,
  };
  if (entries.length === 0) {
    return {
      payload: projectPlatformLookupV2({
        query,
        request: responseRequest,
        entries: [],
        page,
      }),
      status: 200,
      serverTiming: serverTiming(),
    };
  }

  const entryIds = entries.map((entry) => entry.id);
  const identityPromise = measure<RpcResult>(
    timings,
    "lookup.identity",
    async () =>
      await context.service.supabase.rpc(
        "read_platform_v2_presentation_identity",
        {
          p_user_id:
            context.kind === "authenticated" ? context.auth.user.id : null,
          p_entry_ids: entryIds,
          p_catalog: context.kind === "catalog",
        },
      ),
  );
  const statePromise =
    context.kind === "authenticated"
      ? measure<RpcResult>(timings, "lookup.user-state", async () =>
          await context.auth.supabase.rpc(
            "get_user_card_states_for_entries",
            {
              p_user_id: context.auth.user.id,
              p_entry_ids: entryIds,
              p_card_type_ids: [request.cardTypeId],
            },
          ),
        )
      : Promise.resolve<RpcResult>({ data: [], error: null });
  const [identityResult, stateResult] = await Promise.all([
    identityPromise,
    statePromise,
  ]);

  if (identityResult.error) {
    return {
      payload: {
        error: "presentation_identity_failed",
        detail: errorMessage(identityResult.error),
      },
      status: 500,
      serverTiming: serverTiming(),
    };
  }
  if (stateResult.error) {
    return {
      payload: {
        error: "user_state_failed",
        detail: errorMessage(stateResult.error),
      },
      status: 500,
      serverTiming: serverTiming(),
    };
  }

  const identities = identityEntries(identityResult.data);
  const identityByEntryId = new Map(
    identities.map((identity) => [identity.entryId, identity]),
  );
  if (
    identities.length !== entries.length ||
    entries.some((entry) => !identityByEntryId.has(entry.id))
  ) {
    return {
      payload: { error: "presentation_identity_incomplete" },
      status: 409,
      serverTiming: serverTiming(),
    };
  }
  const stateByEntryId = new Map<string, Record<string, unknown>>();
  for (const row of Array.isArray(stateResult.data) ? stateResult.data : []) {
    const record = asRecord(row);
    if (
      typeof record.entry_id === "string" &&
      record.card_type_id === request.cardTypeId
    ) {
      stateByEntryId.set(record.entry_id, record);
    }
  }
  const bindingsByEntryId = new Map(
    identities.map((identity) => [
      identity.entryId,
      identity.contentNodeBindings,
    ]),
  );
  const translationResult = request.translationTargetLanguageCode
    ? await measure(timings, "lookup.translations", () =>
        resolvePlatformV2Translations(context.service, {
          entries,
          bindingsByEntryId,
          targetLanguageCode: request.translationTargetLanguageCode!,
        }),
      )
    : {
        ok: true as const,
        byEntryId: new Map(),
      };
  if (!translationResult.ok) {
    return {
      payload: {
        error: "translation_cache_failed",
        detail: translationResult.error,
      },
      status: 500,
      serverTiming: serverTiming(),
    };
  }

  try {
    const projectionEntries = await measure(
      timings,
      "lookup.projection-input",
      () =>
        Promise.all(
          entries.map(async (entry): Promise<PlatformLookupV2ProjectionEntry> => {
            const identity = identityByEntryId.get(entry.id);
            if (!identity) {
              throw new Error("presentation_identity_incomplete");
            }
            const dictionary = dictionarySummary(entry);
            if (!dictionary) {
              throw new Error("presentation_dictionary_missing");
            }
            const content = await verifyDictionaryContentAudioLinks(
              normalizeDictionaryContent(entry),
            );
            const contentNodeBindings = identity.contentNodeBindings.map(
              (binding) => ({
                ...binding,
                translations:
                  translationResult.byEntryId
                    .get(entry.id)
                    ?.nodeTranslationsById.get(binding.contentNodeId) ?? [],
              }),
            );
            const contentSections = extractPlatformV2ContentSections(entry);
            const headerEvidence = platformV2HeaderEvidence(entry);
            const crossReferenceQuery =
              platformV2CrossReferenceQuery(entry);
            const projectedWordDetails = !crossReferenceQuery
              ? projectPlatformV2WordDetails(entry, contentNodeBindings)
              : null;
            const wordDetails =
              context.kind === "authenticated"
                ? projectedWordDetails
                : null;
            const entryContentRevision = platformV2ContentRevision(
              entry.id,
              contentSections,
              projectedWordDetails,
              crossReferenceQuery,
              headerEvidence,
            );
            const projectedEntry: DictionaryLookupResult["entry"] = {
              id: entry.id,
              dictionaryId: entry.dictionary_id ?? null,
              languageCode: entry.language_code ?? null,
              headword: entry.headword,
              meaningId: entry.meaning_id ?? null,
              partOfSpeech: entry.part_of_speech ?? null,
              gender: entry.gender ?? null,
              content: {
                ...content,
                sourceMeta: {
                  ...content.sourceMeta,
                  ...(headerEvidence.displayPronunciation
                    ? {
                        pronunciation_with_stress:
                          headerEvidence.displayPronunciation,
                      }
                    : {}),
                  ...(headerEvidence.pronunciation
                    ? { pronunciation: headerEvidence.pronunciation }
                    : {}),
                  ...(headerEvidence.homographNumber
                    ? {
                        homograph_number:
                          headerEvidence.homographNumber,
                      }
                    : {}),
                },
              } as DictionaryLookupResult["entry"]["content"],
              contentFingerprint: entryContentRevision,
              raw: entry.raw,
              isNt22000: entry.is_nt2_2000 ?? null,
              meaningsCount: entry.meanings_count ?? null,
            };
            const translations = translationResult.byEntryId.get(entry.id);
            return {
              headwordGroupId: identity.headwordGroupId,
              meaningOrdinal: identity.meaningOrdinal,
              allowMutationCapabilities:
                context.kind === "authenticated" &&
                context.auth.principal.scopes.has("platform:write"),
              allowWordDetailsCapability:
                context.kind === "authenticated",
              entry: projectedEntry,
              dictionary,
              contentNodeBindings,
              contentSections,
              crossReferenceQuery,
              cardState:
                context.kind === "authenticated"
                  ? projectionCardState(
                      entry.id,
                      request.cardTypeId,
                      stateByEntryId.get(entry.id),
                    )
                  : null,
              entryTranslation:
                translations?.entryTranslation ?? null,
              ...(wordDetails ? { wordDetails } : {}),
            };
          }),
        ),
    );

    return {
      payload: projectPlatformLookupV2({
        query,
        request: responseRequest,
        entries: projectionEntries,
        page,
      }),
      status: 200,
      serverTiming: serverTiming(),
    };
  } catch (error) {
    if (error instanceof PlatformV2ProjectionError) {
      return {
        payload: {
          error: "presentation_contract_incomplete",
          detail: error.code,
        },
        status: 409,
        serverTiming: serverTiming(),
      };
    }
    return {
      payload: {
        error: "presentation_projection_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      status: 500,
      serverTiming: serverTiming(),
    };
  }
}

function validIntent(intent: LookupIntent | undefined): LookupIntent {
  if (
    intent === "training-review" ||
    intent === "external-click" ||
    intent === "dictionary-lookup"
  ) {
    return intent;
  }
  return "dictionary-lookup";
}

function lookupEntries(value: unknown): DictionaryLookupPayload[] {
  const payload = asRecord(value);
  const items = payload.items ?? value;
  if (Array.isArray(items)) return items as DictionaryLookupPayload[];
  return items ? [items as DictionaryLookupPayload] : [];
}

function lookupPage(
  payload: Record<string, unknown>,
): PlatformLookupV2Response["page"] {
  const page = asRecord(payload.page);
  return {
    selectedTierComplete: page.selectedTierComplete === true,
    nextGroupCursor:
      typeof page.nextGroupCursor === "string"
        ? page.nextGroupCursor
        : null,
  };
}

function identityEntries(value: unknown): PlatformV2IdentityEntry[] {
  const entries = asRecord(value).entries;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((value) => {
    const entry = asRecord(value);
    if (
      typeof entry.entryId !== "string" ||
      typeof entry.headwordGroupId !== "string" ||
      !Array.isArray(entry.contentNodeBindings)
    ) {
      return [];
    }
    return [
      {
        entryId: entry.entryId,
        headwordGroupId: entry.headwordGroupId,
        meaningOrdinal:
          typeof entry.meaningOrdinal === "number"
            ? entry.meaningOrdinal
            : null,
        contentNodeBindings:
          entry.contentNodeBindings as PlatformContentNodeBindingV2Input[],
      },
    ];
  });
}

function dictionarySummary(
  entry: DictionaryLookupPayload,
): DictionarySummary | null {
  const rawDictionary = Array.isArray(entry.dictionary)
    ? entry.dictionary[0]
    : entry.dictionary;
  const dictionary = asRecord(rawDictionary);
  const id =
    typeof dictionary.id === "string"
      ? dictionary.id
      : entry.dictionary_id;
  const languageCode =
    typeof dictionary.language_code === "string"
      ? dictionary.language_code
      : entry.language_code;
  if (!id || !languageCode) return null;
  const visibility = dictionary.visibility;
  return {
    id,
    languageCode,
    slug:
      typeof dictionary.slug === "string" ? dictionary.slug : "",
    name:
      typeof dictionary.name === "string" ? dictionary.name : "",
    kind: dictionary.kind === "user" ? "user" : "curated",
    visibility:
      visibility === "private" ||
      visibility === "shared" ||
      visibility === "public"
        ? visibility
        : "system",
    ownerUserId:
      typeof dictionary.owner_user_id === "string"
        ? dictionary.owner_user_id
        : null,
    isEditable:
      typeof dictionary.is_editable === "boolean"
        ? dictionary.is_editable
        : null,
    schemaKey:
      typeof dictionary.schema_key === "string"
        ? dictionary.schema_key
        : null,
    schemaVersion:
      typeof dictionary.schema_version === "number"
        ? dictionary.schema_version
        : null,
  };
}

function projectionCardState(
  entryId: string,
  cardTypeId: CardTypeId,
  row?: Record<string, unknown>,
): ProjectionCardState {
  const snapshot = {
    entryId,
    cardTypeId,
    clickCount: numberValue(row?.click_count),
    seenCount: numberValue(row?.seen_count),
    successCount: numberValue(row?.success_count),
    lastSeenAt: stringOrNull(row?.last_seen_at),
    lastReviewedAt: stringOrNull(row?.last_reviewed_at),
    nextReviewAt: stringOrNull(row?.next_review_at),
    hidden: row?.hidden === true,
    frozenUntil: stringOrNull(row?.frozen_until),
    inLearning: row?.in_learning === true,
    learningDueAt: stringOrNull(row?.learning_due_at),
    fsrs: {
      stability: numberOrNull(row?.fsrs_stability),
      difficulty: numberOrNull(row?.fsrs_difficulty),
      reps: numberValue(row?.fsrs_reps),
      lapses: numberValue(row?.fsrs_lapses),
      lastGrade: numberOrNull(row?.fsrs_last_grade),
      lastInterval: numberOrNull(row?.fsrs_last_interval),
      paramsVersion: stringOrNull(row?.fsrs_params_version),
    },
  };
  return {
    ...snapshot,
    stateRevision: crypto
      .createHash("sha256")
      .update(JSON.stringify(snapshot))
      .digest("hex"),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function errorMessage(value: unknown) {
  const record = asRecord(value);
  return typeof record.message === "string"
    ? record.message
    : String(value);
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : 0;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

async function measure<T>(
  timings: Array<{ name: string; durationMs: number }>,
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
