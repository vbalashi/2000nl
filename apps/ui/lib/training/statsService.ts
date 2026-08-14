import { supabase } from "../supabaseClient";
import { trainingDebug } from "../trainingDebug";
import type {
  DetailedStats,
  TrainingMode,
  WordListType,
} from "../types";

export async function fetchStats(
  userId: string,
  modes: TrainingMode[],
  listScope?: { listId?: string | null; listType?: WordListType },
  logContext?: string,
): Promise<DetailedStats> {
  const payload: Record<string, any> = {
    p_user_id: userId,
    p_modes: modes,
  };

  if (listScope?.listId) {
    payload.p_list_id = listScope.listId;
    payload.p_list_type = listScope.listType ?? "curated";
  }

  const { data, error } = await supabase.rpc(
    "get_detailed_training_stats",
    payload,
  );

  if (error) {
    console.error("Error fetching stats:", error);
    return {
      newWordsToday: 0,
      newCardsToday: 0,
      dailyNewLimit: 10,
      reviewWordsDone: 0,
      reviewCardsDone: 0,
      reviewWordsDue: 0,
      reviewCardsDue: 0,
      totalWordsLearned: 0,
      totalWordsInList: 2000,
    };
  }

  const stats = {
    newWordsToday: data.newWordsToday ?? 0,
    newCardsToday: data.newCardsToday ?? 0,
    dailyNewLimit: data.dailyNewLimit ?? 10,
    reviewWordsDone: data.reviewWordsDone ?? 0,
    reviewCardsDone: data.reviewCardsDone ?? 0,
    reviewWordsDue: data.reviewWordsDue ?? 0,
    reviewCardsDue: data.reviewCardsDue ?? 0,
    totalWordsLearned: data.totalWordsLearned ?? 0,
    totalWordsInList: data.totalWordsInList ?? 2000,
  };

  // Log stats with context if provided
  if (logContext) {
    trainingDebug.log(
      `%c 📊 Stats [${logContext}]:`,
      "color: #8b5cf6; font-weight: bold;",
      `NIEUW: ${stats.newCardsToday}/${stats.dailyNewLimit}`,
      `| HERHALING: ${stats.reviewCardsDone}/${
        stats.reviewCardsDone + stats.reviewCardsDue
      }`,
      `| TOTAAL: ${stats.totalWordsLearned}/${stats.totalWordsInList}`,
    );
  }

  return stats;
}
