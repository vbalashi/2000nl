import type { AuthenticatedSupabase, ServiceSupabase } from "./serverSupabase";
import type { ListCardPolicy, ReviewResult, TrainingMode } from "@/lib/types";
import crypto from "crypto";

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

type DictionaryLookupPayload = {
  id: string;
  dictionary_id?: string | null;
  language_code?: string | null;
  headword: string;
  meaning_id?: number | null;
  part_of_speech?: string | null;
  gender?: string | null;
  raw: unknown;
  is_nt2_2000?: boolean | null;
  meanings_count?: number | null;
  dictionary?: DictionaryMetadataRow | null;
  dictionary_name?: string | null;
  dictionary_slug?: string | null;
  dictionary_kind?: string | null;
  search_match_group?: string | null;
  search_matched_text?: string | null;
};

type DictionaryMetadataRow = {
  id: string;
  language_code: string;
  slug: string;
  name: string;
  kind: string;
  visibility: string;
  owner_user_id?: string | null;
  is_editable?: boolean | null;
  schema_key: string | null;
  schema_version: number | null;
};

type InternalListMembershipRow = {
  entry_id?: string | null;
  lists?: Array<{
    id?: string | null;
    kind?: string | null;
    name?: string | null;
    description?: string | null;
    primary_language_code?: string | null;
    default_scenario_id?: string | null;
    card_policy?: string | null;
    card_type_ids?: string[] | null;
    item_count?: number | null;
  }>;
};

type EntryListMembership = {
  entryId: string;
  lists: Array<{
    id: string | null;
    kind: string;
    name: string;
    description: string | null;
    primaryLanguageCode: string | null;
    defaultScenarioId: string | null;
    cardPolicy: string;
    cardTypeIds: string[] | null;
    itemCount: number;
  }>;
};

type PlatformUserCardStatePayload = {
  cardTypeId: TrainingMode;
  entryId: string;
  clickCount: number;
  seenCount: number;
  successCount: number;
  lastSeenAt: string | null;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  hidden: boolean;
  frozenUntil: string | null;
  inLearning: boolean;
  learningDueAt: string | null;
  fsrs: {
    stability: number | null;
    difficulty: number | null;
    reps: number;
    lapses: number;
    lastGrade: number | null;
    lastInterval: number | null;
    paramsVersion: string | null;
  };
};

export type PlatformOperationResult = {
  payload: unknown;
  status: number;
};

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

function latestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

function earliestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}

function strengthScore(state: PlatformUserCardStatePayload) {
  return (
    state.fsrs.reps * 1000 +
    (state.fsrs.stability ?? 0) * 10 +
    state.successCount -
    state.fsrs.lapses * 100
  );
}

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function contentFingerprint(content: unknown) {
  const record = asRecord(content);
  const { sourceMeta: _sourceMeta, ...learnerVisibleContent } = record;
  return crypto
    .createHash("sha256")
    .update(stableJson(learnerVisibleContent))
    .digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string");
  return items.length ? items : undefined;
}

function sectionId(kind: string, index: number, childIndex?: number) {
  return childIndex === undefined
    ? `${kind}-${index + 1}`
    : `${kind}-${index + 1}-${childIndex + 1}`;
}

function translationText(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts = value.filter((item): item is string => typeof item === "string");
    return parts.length ? parts.join("; ") : undefined;
  }
  return undefined;
}

function buildContentSections(
  rawMeanings: unknown[],
  fallbackDefinition: string | null,
) {
  const sections: Array<{
    id: string;
    sourcePath: string;
    kind: "meaning" | "example" | "idiom" | "form" | "note";
    label?: string;
    text: string;
    translation?: string;
  }> = [];

  rawMeanings.forEach((meaning, meaningIndex) => {
    const item = asRecord(meaning);
    const definition =
      typeof item.definition === "string"
        ? item.definition
        : typeof item.text === "string"
          ? item.text
          : null;
    const translations = asRecord(item.translations);
    const firstTranslation = Object.values(translations)
      .map((value) => translationText(value))
      .find((value): value is string => Boolean(value));

    if (definition) {
      sections.push({
        id: sectionId("meaning", meaningIndex),
        sourcePath: `raw.meanings[${meaningIndex}].definition`,
        kind: "meaning",
        text: definition,
        ...(firstTranslation ? { translation: firstTranslation } : {}),
      });
    }

    asStringArray(item.examples)?.forEach((example, exampleIndex) => {
      sections.push({
        id: sectionId("example", meaningIndex, exampleIndex),
        sourcePath: `raw.meanings[${meaningIndex}].examples[${exampleIndex}]`,
        kind: "example",
        text: example,
      });
    });

    if (Array.isArray(item.idioms)) {
      item.idioms.forEach((idiom, idiomIndex) => {
        const idiomRecord = asRecord(idiom);
        const text =
          typeof idiom === "string"
            ? idiom
            : typeof idiomRecord.expression === "string"
              ? idiomRecord.expression
              : null;
        if (!text) return;
        sections.push({
          id: sectionId("idiom", meaningIndex, idiomIndex),
          sourcePath: `raw.meanings[${meaningIndex}].idioms[${idiomIndex}]`,
          kind: "idiom",
          text,
          ...(typeof idiomRecord.explanation === "string"
            ? { label: idiomRecord.explanation }
            : {}),
        });
      });
    }
  });

  if (sections.length === 0 && fallbackDefinition) {
    sections.push({
      id: "meaning-1",
      sourcePath: "raw.definition",
      kind: "meaning",
      text: fallbackDefinition,
    });
  }

  return sections;
}

function normalizeDictionaryContent(entry: DictionaryLookupPayload) {
  const raw = asRecord(entry.raw);
  const rawMeanings = Array.isArray(raw.meanings) ? raw.meanings : [];
  const fallbackDefinition =
    typeof raw.definition === "string"
      ? raw.definition
      : typeof raw.notes === "string"
        ? raw.notes
        : null;
  const meanings =
    rawMeanings.length > 0
      ? rawMeanings.map((meaning) => {
          const item = asRecord(meaning);
          return {
            definition:
              typeof item.definition === "string"
                ? item.definition
                : typeof item.text === "string"
                  ? item.text
                  : null,
            context: typeof item.context === "string" ? item.context : null,
            examples: asStringArray(item.examples),
            translations: asRecord(item.translations),
            idioms: Array.isArray(item.idioms) ? item.idioms : undefined,
          };
        })
      : [
          {
            definition: fallbackDefinition,
            translations:
              raw.translation && typeof raw.translation === "object"
                ? {
                    [String((raw.translation as any).languageCode ?? "unknown")]:
                      String((raw.translation as any).text ?? ""),
                  }
                : {},
          },
        ];

  const content = {
    headword: typeof raw.headword === "string" ? raw.headword : entry.headword,
    languageCode:
      typeof raw.languageCode === "string"
        ? raw.languageCode
        : typeof raw.language_code === "string"
          ? raw.language_code
          : entry.language_code ?? "nl",
    meaningId:
      typeof raw.meaning_id === "number"
        ? raw.meaning_id
        : typeof raw.meaningId === "number"
          ? raw.meaningId
          : entry.meaning_id ?? null,
    partOfSpeech:
      typeof raw.part_of_speech === "string"
        ? raw.part_of_speech
        : typeof raw.partOfSpeech === "string"
          ? raw.partOfSpeech
          : entry.part_of_speech ?? null,
    gender: typeof raw.gender === "string" ? raw.gender : entry.gender ?? null,
    meanings,
    audioLinks:
      raw.audio_links && typeof raw.audio_links === "object"
        ? (raw.audio_links as Record<string, string | null>)
        : undefined,
    images: asStringArray(raw.images),
    morphology:
      raw.morphology && typeof raw.morphology === "object"
        ? (raw.morphology as Record<string, unknown>)
        : undefined,
    sections: buildContentSections(rawMeanings, fallbackDefinition),
    sourceMeta: asRecord(raw._metadata ?? raw.sourceMeta),
  };

  return content;
}

function buildProgressSummary(
  statesByCardType: Record<string, PlatformUserCardStatePayload>,
) {
  const states = Object.values(statesByCardType);
  if (states.length === 0) {
    return {
      status: "new",
      trackedCardCount: 0,
      reviewedCardCount: 0,
      learningCardCount: 0,
      hiddenCardCount: 0,
      strongestCardTypeId: null,
      weakestCardTypeId: null,
      lastReviewedAt: null,
      nextReviewAt: null,
    };
  }

  const reviewed = states.filter((state) => state.fsrs.reps > 0);
  const learning = states.filter((state) => state.inLearning);
  const hidden = states.filter((state) => state.hidden);
  const scored = [...states].sort((a, b) => strengthScore(a) - strengthScore(b));
  const status =
    hidden.length === states.length
      ? "hidden"
      : learning.length > 0
        ? "learning"
        : reviewed.length === states.length
          ? "reviewing"
          : reviewed.length > 0
            ? "mixed"
            : "seen";

  return {
    status,
    trackedCardCount: states.length,
    reviewedCardCount: reviewed.length,
    learningCardCount: learning.length,
    hiddenCardCount: hidden.length,
    weakestCardTypeId: scored[0]?.cardTypeId ?? null,
    strongestCardTypeId: scored[scored.length - 1]?.cardTypeId ?? null,
    lastReviewedAt: latestTimestamp(states.map((state) => state.lastReviewedAt)),
    nextReviewAt: earliestTimestamp(states.map((state) => state.nextReviewAt)),
  };
}

function buildCardCapability(
  state: PlatformUserCardStatePayload | undefined,
) {
  const now = Date.now();
  const frozenUntilMs = state?.frozenUntil ? Date.parse(state.frozenUntil) : NaN;
  const phase =
    state?.hidden
      ? "hidden"
      : Number.isFinite(frozenUntilMs) && frozenUntilMs > now
        ? "frozen"
        : state?.inLearning
          ? "learning"
          : (state?.fsrs.reps ?? 0) > 0
            ? "reviewing"
            : (state?.seenCount ?? 0) > 0 || (state?.clickCount ?? 0) > 0
              ? "encountered"
              : "not-started";
  const actions: PlatformAction[] =
    phase === "not-started" || phase === "encountered"
      ? ["start-learning", "mark-known"]
      : phase === "learning" || phase === "reviewing"
        ? ["review-card"]
        : [];

  return {
    phase,
    actions,
    ...(actions.includes("review-card")
      ? { reviewResults: ["fail", "hard", "success", "easy"] as const }
      : {}),
    frozenUntil: state?.frozenUntil ?? null,
  };
}

function lookupMatchRelation(entry: DictionaryLookupPayload, query: string) {
  const group = entry.search_match_group;
  if (group === "exact-headword") return "exact";
  if (group === "lemma-or-inflection") return "inflection";
  if (entry.headword.trim().toLocaleLowerCase() === query.trim().toLocaleLowerCase()) {
    return "exact";
  }
  return "unknown";
}

function lookupMatchedForm(entry: DictionaryLookupPayload, query: string) {
  if (entry.search_matched_text) return entry.search_matched_text;
  if (entry.search_match_group === "lemma-or-inflection") return query;
  if (lookupMatchRelation(entry, query) === "exact") return entry.headword;
  return undefined;
}

function dictionarySummaryFromLookupPayload(entry: DictionaryLookupPayload) {
  const dictionary = entry.dictionary ?? null;
  if (dictionary) {
    return {
      id: dictionary.id,
      languageCode: dictionary.language_code,
      slug: dictionary.slug,
      name: dictionary.name,
      kind: dictionary.kind,
      visibility: dictionary.visibility,
      schemaKey: dictionary.schema_key,
      schemaVersion: dictionary.schema_version,
      isEditable: dictionary.is_editable ?? null,
    };
  }

  if (!entry.dictionary_id) return null;
  return {
    id: entry.dictionary_id,
    languageCode: entry.language_code ?? null,
    slug: entry.dictionary_slug ?? "",
    name: entry.dictionary_name ?? "",
    kind: entry.dictionary_kind ?? "curated",
    visibility: null,
    schemaKey: null,
    schemaVersion: null,
    isEditable: null,
  };
}

function dictionaryCanBeEditedByUser(
  entry: DictionaryLookupPayload,
  userId: string,
) {
  const dictionary = entry.dictionary ?? null;
  return (
    dictionary?.kind === "user" &&
    dictionary.is_editable === true &&
    dictionary.owner_user_id === userId
  );
}

async function recordReview(auth: AuthenticatedSupabase, params: {
  entryId: string;
  mode: TrainingMode;
  result: ReviewResult;
  turnId?: string | null;
}) {
  return auth.supabase.rpc("handle_card_review", {
    p_user_id: auth.user.id,
    p_entry_id: params.entryId,
    p_card_type_id: params.mode,
    p_result: params.result,
    p_turn_id: params.turnId ?? null,
  });
}

function mapUserEntryRpcError(
  fallbackError: string,
  error: { message?: string } | unknown,
): PlatformOperationResult {
  const detail =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: string }).message ?? error)
      : String(error);

  if (detail.includes("entry_not_found")) {
    return { payload: { error: "entry_not_found" }, status: 404 };
  }
  if (detail.includes("target_dictionary_not_editable")) {
    return { payload: { error: "target_dictionary_not_editable" }, status: 403 };
  }
  if (detail.includes("duplicate_user_entry")) {
    return { payload: { error: "duplicate_user_entry", detail }, status: 409 };
  }
  if (
    detail.includes("invalid_user_entry") ||
    detail.includes("language_not_found") ||
    detail.includes("language_mismatch")
  ) {
    return { payload: { error: "invalid_user_entry", detail }, status: 400 };
  }

  return { payload: { error: fallbackError, detail }, status: 500 };
}

function mapUserListRpcPayload(row: any) {
  if (!row || typeof row !== "object") return null;
  const count = Array.isArray(row.user_word_list_items)
    ? row.user_word_list_items[0]?.count
    : undefined;

  return {
    id: row.id,
    kind: "user",
    name: row.name,
    description: row.description ?? null,
    primaryLanguageCode: row.primary_language_code ?? row.language_code ?? null,
    defaultScenarioId: row.default_scenario_id ?? null,
    cardPolicy: row.card_policy ?? "inherit",
    cardTypeIds: row.card_type_ids ?? null,
    itemCount: typeof count === "number" ? count : 0,
  };
}

function mapListMembershipRpcRows(rows: unknown): EntryListMembership[] {
  if (!Array.isArray(rows)) return [];

  return (rows as InternalListMembershipRow[])
    .filter((row) => Boolean(row?.entry_id) && Array.isArray(row.lists))
    .map((row) => ({
      entryId: row.entry_id as string,
      lists: (row.lists ?? []).map((list) => ({
        id: list.id ?? null,
        kind: list.kind ?? "user",
        name: list.name ?? "",
        description: list.description ?? null,
        primaryLanguageCode: list.primary_language_code ?? null,
        defaultScenarioId: list.default_scenario_id ?? null,
        cardPolicy: list.card_policy ?? "inherit",
        cardTypeIds: list.card_type_ids ?? null,
        itemCount: list.item_count ?? 0,
      })),
    }));
}

export async function performPlatformLookup(
  auth: AuthenticatedSupabase,
  params: {
    query: string;
    includeUserState: boolean;
    languageCode?: string | null;
    contextText?: string | null;
    intent?: string | null;
  },
): Promise<PlatformOperationResult> {
  const { query, includeUserState, languageCode = null, contextText = null } = params;
  const intent =
    params.intent === "dictionary-lookup" ||
    params.intent === "training-review" ||
    params.intent === "external-click"
      ? params.intent
      : null;
  if (!query) {
    return { payload: { error: "missing_query" }, status: 400 };
  }

  const requestMetadata = {
    languageCode,
    contextText,
    intent,
  };

  const usesSearchSemantics =
    intent === "external-click" || Boolean(languageCode) || Boolean(contextText);
  const { data, error } = usesSearchSemantics
    ? await auth.supabase.rpc("search_word_entries_gated", {
        p_query: query,
        p_part_of_speech: null,
        p_is_nt2: null,
        p_filter_frozen: null,
        p_filter_hidden: null,
        p_page: 1,
        p_page_size: 10,
        p_language_code: languageCode,
        p_dictionary_ids: null,
      })
    : await auth.supabase.rpc("fetch_dictionary_entry_gated", {
        p_headword: query,
      });

  if (error) {
    return {
      payload: { error: "lookup_failed", detail: error.message ?? String(error) },
      status: 500,
    };
  }

  const rawEntries = usesSearchSemantics
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
    };
  }

  const userStateByEntryId = new Map<string, Record<string, PlatformUserCardStatePayload>>();
  const listMembershipsByEntryId = new Map<string, unknown[]>();
  if (includeUserState) {
    const { data: membershipRows, error: membershipError } = await auth.supabase.rpc(
      "get_user_list_memberships_for_entries",
      {
        p_user_id: auth.user.id,
        p_entry_ids: entries.map((entry) => entry.id),
      },
    );

    if (membershipError) {
      return {
        payload: {
          error: "list_memberships_failed",
          detail: membershipError.message ?? String(membershipError),
        },
        status: 500,
      };
    }

    for (const membership of mapListMembershipRpcRows(membershipRows)) {
      listMembershipsByEntryId.set(membership.entryId, membership.lists);
    }

    const { data: stateRows, error: stateError } = await auth.supabase.rpc(
      "get_user_card_states_for_entries",
      {
        p_user_id: auth.user.id,
        p_entry_ids: entries.map((entry) => entry.id),
        p_card_type_ids: Array.from(TRAINING_MODES),
      },
    );

    if (stateError) {
      return {
        payload: {
          error: "user_state_failed",
          detail: stateError.message ?? String(stateError),
        },
        status: 500,
      };
    }

    for (const row of Array.isArray(stateRows) ? stateRows : []) {
      const entryId = asString(row?.entry_id);
      const mode = asTrainingMode(row?.card_type_id);
      if (!entryId || !mode) continue;

      const states = userStateByEntryId.get(entryId) ?? {};
      states[mode] = {
        cardTypeId: mode,
        entryId,
        clickCount: row.click_count ?? 0,
        seenCount: row.seen_count ?? 0,
        successCount: row.success_count ?? 0,
        lastSeenAt: row.last_seen_at ?? null,
        lastReviewedAt: row.last_reviewed_at ?? null,
        nextReviewAt: row.next_review_at ?? null,
        hidden: row.hidden ?? false,
        frozenUntil: row.frozen_until ?? null,
        inLearning: row.in_learning ?? false,
        learningDueAt: row.learning_due_at ?? null,
        fsrs: {
          stability: row.fsrs_stability ?? null,
          difficulty: row.fsrs_difficulty ?? null,
          reps: row.fsrs_reps ?? 0,
          lapses: row.fsrs_lapses ?? 0,
          lastGrade: row.fsrs_last_grade ?? null,
          lastInterval: row.fsrs_last_interval ?? null,
          paramsVersion: row.fsrs_params_version ?? null,
        },
      };
      userStateByEntryId.set(entryId, states);
    }
  }

  const items = entries.map((entry) => {
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
    const content = normalizeDictionaryContent(entry);
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
      match: {
        queriedForm: query,
        ...(matchedForm ? { matchedForm } : {}),
        relation: lookupMatchRelation(entry, query),
      },
      availableActions,
    };
  });

  return {
    payload: {
      query,
      request: requestMetadata,
      items,
    },
    status: 200,
  };
}

export async function performPlatformCatalogLookup(
  service: ServiceSupabase,
  params: {
    query: string;
    languageCode?: string | null;
    contextText?: string | null;
    intent?: string | null;
  },
): Promise<PlatformOperationResult> {
  const { query, languageCode = null, contextText = null } = params;
  const intent =
    params.intent === "dictionary-lookup" ||
    params.intent === "training-review" ||
    params.intent === "external-click"
      ? params.intent
      : null;
  if (!query) {
    return { payload: { error: "missing_query" }, status: 400 };
  }

  const requestMetadata = {
    languageCode,
    contextText,
    intent,
  };

  let queryBuilder = service.supabase
    .from("word_entries")
    .select(
      `
        id,
        dictionary_id,
        language_code,
        headword,
        meaning_id,
        part_of_speech,
        gender,
        raw,
        is_nt2_2000,
        meanings_count,
        dictionary:dictionaries!inner (
          id,
          language_code,
          slug,
          name,
          kind,
          visibility,
          owner_user_id,
          is_editable,
          schema_key,
          schema_version
        )
      `,
    )
    .ilike("headword", query)
    .in("dictionary.visibility", ["system", "public"])
    .limit(10);

  if (languageCode) {
    queryBuilder = queryBuilder.eq("language_code", languageCode);
  }

  const { data, error } = await queryBuilder;

  if (error) {
    return {
      payload: {
        error: "catalog_lookup_failed",
        detail: error.message ?? String(error),
      },
      status: 500,
    };
  }

  const entries = Array.isArray(data)
    ? (data as unknown as DictionaryLookupPayload[])
    : data
      ? [data as unknown as DictionaryLookupPayload]
      : [];

  return {
    payload: {
      query,
      request: requestMetadata,
      items: entries.flatMap((entry) => {
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
        const content = normalizeDictionaryContent(entry);

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
          match: {
            queriedForm: query,
            matchedForm: entry.headword,
            relation:
              entry.headword.trim().toLocaleLowerCase() ===
              query.trim().toLocaleLowerCase()
                ? "exact"
              : "unknown",
          },
        }];
      }),
    },
    status: 200,
  };
}

export async function performPlatformAction(
  auth: AuthenticatedSupabase,
  body: PlatformActionBody | null,
): Promise<PlatformOperationResult> {
  const action = asString(body?.action) as PlatformAction | null;
  const entryId = asString(body?.entryId);

  if (!action) {
    return { payload: { error: "missing_action" }, status: 400 };
  }
  if (
    ![
      "fetch-entry",
      "record-view",
      "review-card",
      "mark-known",
      "mark-unknown",
      "start-learning",
      "add-to-list",
      "remove-from-list",
      "copy-to-user-dictionary",
      "create-user-entry",
      "update-user-entry",
      "delete-user-entry",
      "create-user-list",
      "update-user-list",
      "delete-user-list",
    ].includes(action)
  ) {
    return { payload: { error: "unsupported_action" }, status: 400 };
  }

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
        ? body.entry
        : null;
    if (!entry) {
      return { payload: { error: "missing_entry_payload" }, status: 400 };
    }

    const { data, error } = await auth.supabase.rpc("create_user_dictionary_entry", {
      p_user_id: auth.user.id,
      p_dictionary_id: dictionaryId,
      p_entry: entry,
    });

    if (error) {
      return mapUserEntryRpcError("create_user_entry_failed", error);
    }

    return {
      payload: {
        ok: true,
        action,
        entryId: data,
        dictionaryId: dictionaryId ?? null,
      },
      status: 200,
    };
  }

  if (!entryId) {
    return { payload: { error: "missing_entry_id" }, status: 400 };
  }

  if (action === "update-user-entry") {
    const entry =
      body?.entry && typeof body.entry === "object" && !Array.isArray(body.entry)
        ? body.entry
        : null;
    if (!entry) {
      return { payload: { error: "missing_entry_payload" }, status: 400 };
    }

    const { data, error } = await auth.supabase.rpc("update_user_dictionary_entry", {
      p_user_id: auth.user.id,
      p_entry_id: entryId,
      p_entry: entry,
    });

    if (error) {
      return mapUserEntryRpcError("update_user_entry_failed", error);
    }

    return { payload: { ok: true, action, entryId: data }, status: 200 };
  }

  if (action === "delete-user-entry") {
    const { error } = await auth.supabase.rpc("delete_user_dictionary_entry", {
      p_user_id: auth.user.id,
      p_entry_id: entryId,
    });

    if (error) {
      return mapUserEntryRpcError("delete_user_entry_failed", error);
    }

    return { payload: { ok: true, action, entryId }, status: 200 };
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
