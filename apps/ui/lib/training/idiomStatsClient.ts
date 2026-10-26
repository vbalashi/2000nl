import { supabase } from "@/lib/supabaseClient";
import type { PlatformTrainingExerciseStatsV1 } from "../../../../packages/shared/types/platformV2";

/** The authenticated server derives both principal and saved scope. */
export async function readIdiomTrainingStats(
  sessionId: string,
): Promise<PlatformTrainingExerciseStatsV1> {
  const { data, error } = await supabase.rpc("read_training_idiom_stats_v1", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  const fields = ["newCardsToday", "reviewCardsDone", "reviewCardsDue",
    "totalCardsStarted", "totalCardsInScope"] as const;
  if (!data || data.contractVersion !== "training-idiom-stats-v1" ||
      fields.some((field) => !Number.isSafeInteger(data[field]) || data[field] < 0)) {
    throw new Error("invalid_idiom_training_stats");
  }
  return {
    contractVersion: "training-idiom-stats-v1",
    newCardsToday: data.newCardsToday,
    reviewCardsDone: data.reviewCardsDone,
    reviewCardsDue: data.reviewCardsDue,
    totalCardsStarted: data.totalCardsStarted,
    totalCardsInScope: data.totalCardsInScope,
  };
}
