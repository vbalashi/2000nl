import type { AuthenticatedSupabase } from "./serverSupabase";
import type { ReviewResult, TrainingMode } from "@/lib/types";

const TRAINING_MODES = new Set<TrainingMode>([
  "word-to-definition",
  "definition-to-word",
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
  | "record-view"
  | "review-card"
  | "mark-known"
  | "mark-unknown"
  | "start-learning"
  | "add-to-list";

export type PlatformActionBody = {
  action?: unknown;
  entryId?: unknown;
  cardTypeId?: unknown;
  result?: unknown;
  turnId?: unknown;
  listId?: unknown;
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

async function assertEntryReadable(
  supabase: any,
  entryId: string,
): Promise<boolean | { error: string; detail?: string }> {
  const { data: entry, error } = await supabase
    .from("word_entries")
    .select("id, dictionary_id")
    .eq("id", entryId)
    .maybeSingle();

  if (error) {
    return { error: "entry_lookup_failed", detail: error.message ?? String(error) };
  }
  if (!entry) {
    return { error: "entry_not_found" };
  }
  if (!entry.dictionary_id) {
    return true;
  }

  const { data: dictionary, error: dictionaryError } = await supabase
    .from("dictionaries")
    .select("id")
    .eq("id", entry.dictionary_id)
    .maybeSingle();

  if (dictionaryError) {
    return {
      error: "dictionary_access_check_failed",
      detail: dictionaryError.message ?? String(dictionaryError),
    };
  }

  return dictionary ? true : { error: "entry_not_accessible" };
}

async function recordReview(auth: AuthenticatedSupabase, params: {
  entryId: string;
  mode: TrainingMode;
  result: ReviewResult;
  turnId?: string | null;
}) {
  return auth.supabase.rpc("handle_review", {
    p_user_id: auth.user.id,
    p_word_id: params.entryId,
    p_mode: params.mode,
    p_result: params.result,
    p_turn_id: params.turnId ?? null,
  });
}

export async function performPlatformLookup(
  auth: AuthenticatedSupabase,
  params: { query: string; includeUserState: boolean },
): Promise<PlatformOperationResult> {
  const { query, includeUserState } = params;
  if (!query) {
    return { payload: { error: "missing_query" }, status: 400 };
  }

  const { data, error } = await auth.supabase.rpc("fetch_dictionary_entry_gated", {
    p_headword: query,
  });

  if (error) {
    return {
      payload: { error: "lookup_failed", detail: error.message ?? String(error) },
      status: 500,
    };
  }

  if (!data) {
    return { payload: { query, items: [] }, status: 200 };
  }

  const entry = data as DictionaryLookupPayload;

  let dictionary = null;
  if (entry.dictionary_id) {
    const { data: dictionaryData, error: dictionaryError } = await auth.supabase
      .from("dictionaries")
      .select(
        "id, language_code, slug, name, kind, visibility, schema_key, schema_version",
      )
      .eq("id", entry.dictionary_id)
      .maybeSingle();

    if (dictionaryError) {
      return {
        payload: {
          error: "dictionary_metadata_failed",
          detail: dictionaryError.message ?? String(dictionaryError),
        },
        status: 500,
      };
    }
    dictionary = dictionaryData ?? null;
  }

  let userStateByCardType = undefined;
  if (includeUserState) {
    const { data: statusRows, error: statusError } = await auth.supabase
      .from("user_word_status")
      .select(
        "mode, click_count, last_seen_at, last_reviewed_at, next_review_at, hidden, frozen_until, fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses, fsrs_last_grade, fsrs_last_interval",
      )
      .eq("user_id", auth.user.id)
      .eq("word_id", entry.id);

    if (statusError) {
      return {
        payload: {
          error: "user_state_failed",
          detail: statusError.message ?? String(statusError),
        },
        status: 500,
      };
    }

    userStateByCardType = Object.fromEntries(
      (statusRows ?? []).map((row: any) => [
        row.mode,
        {
          cardTypeId: row.mode,
          entryId: entry.id,
          clickCount: row.click_count ?? 0,
          lastSeenAt: row.last_seen_at ?? null,
          lastReviewedAt: row.last_reviewed_at ?? null,
          nextReviewAt: row.next_review_at ?? null,
          hidden: row.hidden ?? false,
          frozenUntil: row.frozen_until ?? null,
          fsrs: {
            stability: row.fsrs_stability ?? null,
            difficulty: row.fsrs_difficulty ?? null,
            reps: row.fsrs_reps ?? 0,
            lapses: row.fsrs_lapses ?? 0,
            lastGrade: row.fsrs_last_grade ?? null,
            lastInterval: row.fsrs_last_interval ?? null,
          },
        },
      ]),
    );
  }

  return {
    payload: {
      query,
      items: [
        {
          entry: {
            id: entry.id,
            dictionaryId: entry.dictionary_id ?? null,
            languageCode: entry.language_code ?? null,
            headword: entry.headword,
            meaningId: entry.meaning_id ?? null,
            partOfSpeech: entry.part_of_speech ?? null,
            gender: entry.gender ?? null,
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
              }
            : null,
          ...(includeUserState ? { userStateByCardType } : {}),
          availableActions: [
            "record-view",
            "start-learning",
            "mark-known",
            "mark-unknown",
            "review-card",
            "add-to-list",
          ],
        },
      ],
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
      "record-view",
      "review-card",
      "mark-known",
      "mark-unknown",
      "start-learning",
      "add-to-list",
    ].includes(action)
  ) {
    return { payload: { error: "unsupported_action" }, status: 400 };
  }
  if (!entryId) {
    return { payload: { error: "missing_entry_id" }, status: 400 };
  }

  const readable = await assertEntryReadable(auth.supabase, entryId);
  if (readable !== true) {
    const status = readable.error === "entry_not_found" ? 404 : 403;
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
      p_word_id: entryId,
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

  const mode = asTrainingMode(body?.cardTypeId);
  if (!mode) {
    return { payload: { error: "missing_or_invalid_card_type_id" }, status: 400 };
  }

  if (action === "record-view" || action === "start-learning") {
    const { error } =
      action === "start-learning"
        ? await auth.supabase.rpc("start_learning_card", {
            p_user_id: auth.user.id,
            p_word_id: entryId,
            p_mode: mode,
          })
        : await auth.supabase.rpc("record_word_view", {
            p_user_id: auth.user.id,
            p_word_id: entryId,
            p_mode: mode,
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
