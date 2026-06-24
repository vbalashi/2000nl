import type { AuthenticatedSupabase } from "./serverSupabase";
import { mapListMembershipRpcRows } from "./listService";
import type { TrainingMode } from "@/lib/types";

const TRAINING_MODES = new Set<TrainingMode>([
  "word-to-definition",
  "definition-to-word",
  "listen-recognize",
  "listen-type",
]);

export type DictionaryLookupPayload = {
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

export type DictionaryMetadataRow = {
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

export type PlatformUserCardStatePayload = {
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

export type PlatformLookupUserState = {
  userStateByEntryId: Map<string, Record<string, PlatformUserCardStatePayload>>;
  listMembershipsByEntryId: Map<string, unknown[]>;
};

export function lookupMatchRelation(
  entry: DictionaryLookupPayload,
  query: string,
) {
  const group = entry.search_match_group;
  if (group === "exact-headword") return "exact";
  if (group === "lemma-or-inflection") return "inflection";
  if (
    entry.headword.trim().toLocaleLowerCase() ===
    query.trim().toLocaleLowerCase()
  ) {
    return "exact";
  }
  return "unknown";
}

export function lookupMatchedForm(
  entry: DictionaryLookupPayload,
  query: string,
) {
  if (entry.search_matched_text) return entry.search_matched_text;
  if (entry.search_match_group === "lemma-or-inflection") return query;
  if (lookupMatchRelation(entry, query) === "exact") return entry.headword;
  return undefined;
}

export function dictionarySummaryFromLookupPayload(
  entry: DictionaryLookupPayload,
) {
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
    visibility: "system",
    schemaKey: null,
    schemaVersion: null,
    isEditable: null,
  };
}

export function dictionaryCanBeEditedByUser(
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

export async function readLookupUserState(
  auth: AuthenticatedSupabase,
  entries: DictionaryLookupPayload[],
): Promise<
  | { ok: true; value: PlatformLookupUserState }
  | { ok: false; result: { payload: unknown; status: number } }
> {
  const userStateByEntryId = new Map<
    string,
    Record<string, PlatformUserCardStatePayload>
  >();
  const listMembershipsByEntryId = new Map<string, unknown[]>();
  const entryIds = entries.map((entry) => entry.id);

  const [membershipResult, stateResult] = await Promise.all([
    auth.supabase.rpc("get_user_list_memberships_for_entries", {
      p_user_id: auth.user.id,
      p_entry_ids: entryIds,
    }),
    auth.supabase.rpc("get_user_card_states_for_entries", {
      p_user_id: auth.user.id,
      p_entry_ids: entryIds,
      p_card_type_ids: Array.from(TRAINING_MODES),
    }),
  ]);

  const { data: membershipRows, error: membershipError } = membershipResult;

  if (membershipError) {
    return {
      ok: false,
      result: {
        payload: {
          error: "list_memberships_failed",
          detail: membershipError.message ?? String(membershipError),
        },
        status: 500,
      },
    };
  }

  for (const membership of mapListMembershipRpcRows(membershipRows)) {
    listMembershipsByEntryId.set(membership.entryId, membership.lists);
  }

  const { data: stateRows, error: stateError } = stateResult;

  if (stateError) {
    return {
      ok: false,
      result: {
        payload: {
          error: "user_state_failed",
          detail: stateError.message ?? String(stateError),
        },
        status: 500,
      },
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

  return {
    ok: true,
    value: {
      userStateByEntryId,
      listMembershipsByEntryId,
    },
  };
}

export function buildProgressSummary(
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

export function buildCardCapability(
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
  const actions =
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

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asTrainingMode(value: unknown): TrainingMode | null {
  const mode = asString(value);
  return mode && TRAINING_MODES.has(mode as TrainingMode)
    ? (mode as TrainingMode)
    : null;
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
