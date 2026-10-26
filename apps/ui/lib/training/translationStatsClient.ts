import { supabase } from "@/lib/supabaseClient";
import type { PlatformTrainingExerciseStatsV1 } from "../../../../packages/shared/types/platformV2";

export async function readTranslationTrainingStats(sessionId: string): Promise<PlatformTrainingExerciseStatsV1> {
  const { data, error } = await supabase.rpc("read_training_translation_stats_v1", { p_session_id: sessionId });
  if (error) throw error;
  const fields = ["newCardsToday", "reviewCardsDone", "reviewCardsDue", "totalCardsStarted", "totalCardsInScope"] as const;
  if (!data || data.contractVersion !== "training-translation-stats-v1" || fields.some((key) => !Number.isSafeInteger(data[key]) || data[key] < 0)) throw new Error("invalid_translation_training_stats");
  return { contractVersion: "training-translation-stats-v1", newCardsToday: data.newCardsToday, reviewCardsDone: data.reviewCardsDone, reviewCardsDue: data.reviewCardsDue, totalCardsStarted: data.totalCardsStarted, totalCardsInScope: data.totalCardsInScope };
}
