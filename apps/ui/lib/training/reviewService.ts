import { supabase } from "../supabaseClient";
import type { ReviewResult, TrainingMode } from "../types";

export type WordStatusAfterReview = {
  interval: number | null;
  reps: number | null;
  stability: number | null;
  clicks: number | null;
  next_review: string | null;
  in_learning: boolean | null;
  learning_due_at: string | null;
};

export type LastReviewDebug = {
  reviewed_at: string | null;
  scheduled_at: string | null;
  review_type: string | null;
  grade: number | null;
  interval_after: number | null;
  stability_before: number | null;
  stability_after: number | null;
  metadata: {
    elapsed_days?: number;
    retrievability?: number;
    same_day?: boolean;
    last_reviewed_at_before?: string | null;
    click?: boolean;
    [key: string]: unknown;
  } | null;
} | null;

export type RecordReviewParams = {
  userId: string;
  wordId: string;
  mode: TrainingMode;
  result: ReviewResult;
  // Unique ID for the user's "turn" on a presented card. Used for backend idempotency.
  // Nullable for backward compatibility and to support older deployments.
  turnId?: string | null;
};

export const recordWordView = async (params: {
  userId: string;
  wordId: string;
  mode: TrainingMode;
}) => {
  // We can just log a 'view' event if we want, but the RPC "handle_review" or "handle_click" does the heavy lifting.
  // "Seen" count is less critical now that we have SM2.
  // However, we might still want to track simple "shown" stats.
  // For now, let's keep it simple and NOT do a DB call just for "shown",
  // OR we can make a lightweight RPC for 'record_view'.
  // Given the requirements, I'll skip explicit 'view' recording for now to save bandwidth,
  // as the critical part is 'result' or 'click'.
  // If we really need 'seen_count' updated on every show, we should add an RPC 'mark_seen'.

  // Let's implement a simple update if we want to preserve 'seen_count' logic,
  // but honestly, SM2 relies on 'reps' (reviews).
  // I will leave this empty or minimal for now unless requested.
  // Actually, let's just log it to user_word_status so 'seen_count' is accurate-ish.
  // but without locking or complex logic.

  const { error } = await supabase.rpc("record_word_view", {
    p_user_id: params.userId,
    p_word_id: params.wordId,
    p_mode: params.mode,
  });

  if (error) {
    console.error("Error recording word view via RPC", error);
  }
};

export const recordReview = async (
  params: RecordReviewParams,
): Promise<WordStatusAfterReview | null> => {
  const argsBase = {
    p_user_id: params.userId,
    p_word_id: params.wordId,
    p_mode: params.mode,
    p_result: params.result,
  } as const;

  // Prefer sending turnId for idempotency, but fall back to the legacy signature
  // if the backend hasn't been migrated yet.
  const tryWithTurnId = async () =>
    supabase.rpc("handle_review", {
      ...argsBase,
      p_turn_id: params.turnId ?? null,
    });

  const tryLegacy = async () => supabase.rpc("handle_review", argsBase);

  let rpc = params.turnId ? await tryWithTurnId() : await tryLegacy();
  if (rpc.error && params.turnId) {
    const msg = rpc.error.message ?? "";
    const code = (rpc.error as any)?.code as string | undefined;
    const looksLikeLegacySignature =
      code === "PGRST202" ||
      msg.includes("Could not find the function") ||
      msg.includes("p_turn_id") ||
      msg.includes("handle_review");
    if (looksLikeLegacySignature) {
      rpc = await tryLegacy();
    }
  }

  if (rpc.error) {
    console.error("Error recording review via RPC", rpc.error);
    return null;
  }

  const { data: statusData, error: fetchError } = await supabase.rpc(
    "get_card_user_state",
    {
      p_user_id: params.userId,
      p_word_id: params.wordId,
      p_mode: params.mode,
    },
  );

  if (fetchError || !statusData) {
    // If the basic query fails, the review was still recorded - just can't show updated stats
    if (fetchError) {
      console.warn("Could not fetch updated status:", fetchError.message);
    }
    return null;
  }

  return {
    interval: statusData.fsrs_last_interval,
    reps: statusData.fsrs_reps,
    stability: statusData.fsrs_stability,
    clicks: statusData.click_count,
    next_review: statusData.next_review_at,
    in_learning: statusData.in_learning ?? null,
    learning_due_at: statusData.learning_due_at ?? null,
  };
};

export const fetchLastReviewDebug = async (params: {
  userId: string;
  wordId: string;
  mode: TrainingMode;
}): Promise<LastReviewDebug> => {
  const { data, error } = await supabase.rpc("get_last_review_debug", {
    p_user_id: params.userId,
    p_word_id: params.wordId,
    p_mode: params.mode,
  });

  if (error) {
    // In most environments this function is intentionally not exposed publicly
    // (it may live in `private` schema or not exist at all). Avoid polluting
    // automation runs with noisy warnings for an optional debug feature.
    const msg = error.message ?? "";
    const code = (error as any)?.code as string | undefined;
    const isMissingFn =
      code === "PGRST202" ||
      msg.includes("Could not find the function") ||
      msg.includes("schema cache");
    if (!isMissingFn) {
      console.warn("Could not fetch last review debug:", msg);
    }
    return null;
  }

  // The RPC returns jsonb; Supabase client may surface it as object already.
  return (data ?? null) as LastReviewDebug;
};

export const recordDefinitionClick = async (params: {
  userId: string;
  wordId?: string | null;
  mode: TrainingMode;
}) => {
  void params;
  // Ordinary dictionary lookup/click is intentionally read-only. `handle_click`
  // is reserved for explicit training lapse actions because it mutates FSRS
  // state and writes a review-log row.
};
