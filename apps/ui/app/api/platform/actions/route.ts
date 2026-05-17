import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
} from "@/lib/platform/serverSupabase";
import type { ReviewResult, TrainingMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

type PlatformAction =
  | "record-view"
  | "review-card"
  | "mark-unknown"
  | "start-learning"
  | "add-to-list";

type ActionBody = {
  action?: unknown;
  entryId?: unknown;
  cardTypeId?: unknown;
  result?: unknown;
  turnId?: unknown;
  listId?: unknown;
};

async function readJson(request: NextRequest): Promise<ActionBody | null> {
  try {
    return (await request.json()) as ActionBody;
  } catch {
    return null;
  }
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

async function recordView(supabase: any, params: {
  userId: string;
  entryId: string;
  mode: TrainingMode;
}) {
  return supabase.rpc("record_word_view", {
    p_user_id: params.userId,
    p_word_id: params.entryId,
    p_mode: params.mode,
  });
}

async function recordReview(supabase: any, params: {
  userId: string;
  entryId: string;
  mode: TrainingMode;
  result: ReviewResult;
  turnId?: string | null;
}) {
  return supabase.rpc("handle_review", {
    p_user_id: params.userId,
    p_word_id: params.entryId,
    p_mode: params.mode,
    p_result: params.result,
    p_turn_id: params.turnId ?? null,
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) {
    return auth;
  }

  const body = await readJson(request);
  const action = asString(body?.action) as PlatformAction | null;
  const entryId = asString(body?.entryId);

  if (!action) {
    return jsonNoStore({ error: "missing_action" }, 400);
  }
  if (
    ![
      "record-view",
      "review-card",
      "mark-unknown",
      "start-learning",
      "add-to-list",
    ].includes(action)
  ) {
    return jsonNoStore({ error: "unsupported_action" }, 400);
  }
  if (!entryId) {
    return jsonNoStore({ error: "missing_entry_id" }, 400);
  }

  const readable = await assertEntryReadable(auth.supabase, entryId);
  if (readable !== true) {
    const status = readable.error === "entry_not_found" ? 404 : 403;
    return jsonNoStore(readable, status);
  }

  if (action === "add-to-list") {
    const listId = asString(body?.listId);
    if (!listId) {
      return jsonNoStore({ error: "missing_list_id" }, 400);
    }

    const { data: list, error: listError } = await auth.supabase
      .from("user_word_lists")
      .select("id")
      .eq("id", listId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (listError) {
      return jsonNoStore(
        { error: "list_lookup_failed", detail: listError.message ?? String(listError) },
        500,
      );
    }
    if (!list) {
      return jsonNoStore({ error: "list_not_found" }, 404);
    }

    const { error } = await auth.supabase
      .from("user_word_list_items")
      .insert({ list_id: listId, word_id: entryId });

    if (error) {
      return jsonNoStore(
        { error: "add_to_list_failed", detail: error.message ?? String(error) },
        500,
      );
    }

    return jsonNoStore({ ok: true, action, entryId, listId });
  }

  const mode = asTrainingMode(body?.cardTypeId);
  if (!mode) {
    return jsonNoStore({ error: "missing_or_invalid_card_type_id" }, 400);
  }

  if (action === "record-view" || action === "start-learning") {
    const { error } = await recordView(auth.supabase, {
      userId: auth.user.id,
      entryId,
      mode,
    });
    if (error) {
      return jsonNoStore(
        { error: `${action}_failed`, detail: error.message ?? String(error) },
        500,
      );
    }
    return jsonNoStore({ ok: true, action, entryId, cardTypeId: mode });
  }

  const result =
    action === "mark-unknown" ? "fail" : asReviewResult(body?.result);
  if (!result) {
    return jsonNoStore({ error: "missing_or_invalid_result" }, 400);
  }

  const turnId = asString(body?.turnId);
  const { error } = await recordReview(auth.supabase, {
    userId: auth.user.id,
    entryId,
    mode,
    result,
    turnId,
  });

  if (error) {
    return jsonNoStore(
      { error: `${action}_failed`, detail: error.message ?? String(error) },
      500,
    );
  }

  return jsonNoStore({
    ok: true,
    action,
    entryId,
    cardTypeId: mode,
    result,
    turnId: turnId ?? null,
  });
}
