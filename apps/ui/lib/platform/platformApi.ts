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
  const { data: entry, error } = await supabase.rpc(
    "fetch_dictionary_entry_by_id_gated",
    {
      p_word_id: entryId,
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
    itemCount: typeof count === "number" ? count : 0,
  };
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

  const entries = Array.isArray(data)
    ? (data as DictionaryLookupPayload[])
    : data
      ? [data as DictionaryLookupPayload]
      : [];

  if (entries.length === 0) {
    return { payload: { query, items: [] }, status: 200 };
  }

  const dictionaryIds = Array.from(
    new Set(
      entries
        .map((entry) => entry.dictionary_id)
        .filter((id): id is string => typeof id === "string" && Boolean(id)),
    ),
  );

  const dictionaryById = new Map<string, DictionaryMetadataRow>();
  if (dictionaryIds.length > 0) {
    const { data: dictionaryData, error: dictionaryError } = await auth.supabase
      .from("dictionaries")
      .select(
        "id, language_code, slug, name, kind, visibility, owner_user_id, is_editable, schema_key, schema_version",
      )
      .in("id", dictionaryIds);

    if (dictionaryError) {
      return {
        payload: {
          error: "dictionary_metadata_failed",
          detail: dictionaryError.message ?? String(dictionaryError),
        },
        status: 500,
      };
    }
    for (const row of dictionaryData ?? []) {
      dictionaryById.set(row.id, row);
    }
  }

  const userStateByEntryId = new Map<string, Record<string, unknown>>();
  if (includeUserState) {
    for (const entry of entries) {
      for (const mode of TRAINING_MODES) {
        const { data: row, error: statusError } = await auth.supabase.rpc(
          "get_card_user_state",
          {
            p_user_id: auth.user.id,
            p_word_id: entry.id,
            p_mode: mode,
          },
        );

        if (statusError) {
          return {
            payload: {
              error: "user_state_failed",
              detail: statusError.message ?? String(statusError),
            },
            status: 500,
          };
        }
        if (!row) continue;

        const states = userStateByEntryId.get(entry.id) ?? {};
        states[mode] = {
          cardTypeId: mode,
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
        };
        userStateByEntryId.set(entry.id, states);
      }
    }
  }

  const items = entries.map((entry) => {
    const dictionary = entry.dictionary_id
      ? dictionaryById.get(entry.dictionary_id) ?? null
      : null;

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
    if (
      dictionary?.kind === "user" &&
      dictionary.is_editable === true &&
      dictionary.owner_user_id === auth.user.id
    ) {
      availableActions.push("update-user-entry", "delete-user-entry");
    }

    return {
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
            isEditable: dictionary.is_editable ?? null,
          }
        : null,
      ...(includeUserState
        ? { userStateByCardType: userStateByEntryId.get(entry.id) ?? {} }
        : {}),
      availableActions,
    };
  });

  return {
    payload: {
      query,
      items,
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

  if (action === "create-user-list") {
    const name = asString(body?.name);
    if (!name) {
      return { payload: { error: "missing_list_name" }, status: 400 };
    }

    const languageCode = asString(body?.languageCode) ?? "nl";
    const { data, error } = await auth.supabase.rpc("create_user_word_list", {
      p_user_id: auth.user.id,
      p_name: name,
      p_description: asString(body?.description),
      p_language_code: languageCode,
      p_primary_language_code: asString(body?.primaryLanguageCode) ?? languageCode,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("duplicate_user_list")) {
        return { payload: { error: "duplicate_user_list", detail }, status: 409 };
      }
      if (
        detail.includes("invalid_list_name") ||
        detail.includes("language_not_found")
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
    const { data, error } = await auth.supabase.rpc("update_user_word_list", {
      p_user_id: auth.user.id,
      p_list_id: listId,
      p_name: asString(body?.name),
      p_description:
        typeof body?.description === "string" ? body.description : null,
      p_language_code: languageCode,
      p_primary_language_code:
        asString(body?.primaryLanguageCode) ?? languageCode,
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
        detail.includes("language_not_found")
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
      p_word_id: entryId,
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
      p_word_id: entryId,
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
      p_word_ids: [entryId],
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

  if (action === "copy-to-user-dictionary") {
    const targetDictionaryId = asString(body?.targetDictionaryId);
    const overrides =
      body?.overrides && typeof body.overrides === "object" && !Array.isArray(body.overrides)
        ? body.overrides
        : {};

    const { data, error } = await auth.supabase.rpc("copy_entry_to_user_dictionary", {
      p_user_id: auth.user.id,
      p_source_word_id: entryId,
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
