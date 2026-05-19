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
  turnId?: string | null;
};

export const recordWordView = async (params: {
  userId: string;
  wordId: string;
  mode: TrainingMode;
}) => {
  const { error } = await supabase.rpc("record_card_view", {
    p_user_id: params.userId,
    p_entry_id: params.wordId,
    p_card_type_id: params.mode,
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
    p_entry_id: params.wordId,
    p_card_type_id: params.mode,
    p_result: params.result,
  } as const;

  const rpc = await supabase.rpc("handle_card_review", {
    ...argsBase,
    p_turn_id: params.turnId ?? null,
  });

  if (rpc.error) {
    console.error("Error recording review via RPC", rpc.error);
    return null;
  }

  const statusRpc = await supabase.rpc(
    "get_user_card_state",
    {
      p_user_id: params.userId,
      p_entry_id: params.wordId,
      p_card_type_id: params.mode,
    },
  );

  const { data: statusData, error: fetchError } = statusRpc;

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
  // Ordinary dictionary lookup/click is intentionally read-only. Explicit
  // training outcomes are recorded through handle_card_review.
};
