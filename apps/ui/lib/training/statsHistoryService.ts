import { supabase } from "../supabaseClient";
import { trainingDebug } from "../trainingDebug";
import type {
  DetailedStats,
  SidebarHistoryItem,
  TrainingMode,
  WordListType,
} from "../types";
import { mapEventTypeToResult, normalizeRaw } from "./wordMappers";

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

export const fetchRecentHistory = async (
  userId: string,
): Promise<SidebarHistoryItem[]> => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase.rpc("get_recent_training_history", {
    p_user_id: userId,
    p_since: since,
    p_limit: 50,
  });

  if (error || !data) {
    console.error("Error fetching recent history:", error);
    return [];
  }

  type HistoryRow = {
    id: string;
    dictionary_id?: string | null;
    language_code?: string | null;
    headword: string;
    part_of_speech: string | null;
    gender: string | null;
    raw: unknown;
    is_nt2_2000: boolean | null;
    meanings_count?: number | null;
    event_type: string;
    mode: string;
    created_at: string;
    click_count?: number | null;
    last_seen_at?: string | null;
    fsrs_last_interval?: number | null;
    fsrs_reps?: number | null;
    fsrs_stability?: number | null;
    next_review_at?: string | null;
  };

  const rows = data as unknown as HistoryRow[];

  return rows
    .map((row) => {
      const source = row.event_type === "definition_click" ? "click" : "review";
      return {
        id: row.id,
        ...(row.dictionary_id ? { dictionary_id: row.dictionary_id } : {}),
        ...(row.language_code ? { language_code: row.language_code } : {}),
        headword: row.headword,
        part_of_speech: row.part_of_speech ?? undefined,
        gender: row.gender ?? undefined,
        raw: normalizeRaw(row.raw),
        is_nt2_2000: row.is_nt2_2000 ?? undefined,
        meanings_count: row.meanings_count ?? 1,
        source: source as "click" | "review",
        result: mapEventTypeToResult(row.event_type),
        stats: {
          click_count: row.click_count ?? 0,
          last_seen_at: row.last_seen_at ?? row.created_at,
        },
        debugStats: {
          source,
          mode: row.mode as TrainingMode | undefined,
          interval: row.fsrs_last_interval ?? undefined,
          reps: row.fsrs_reps ?? undefined,
          ef: row.fsrs_stability ?? undefined,
          clicks: row.click_count ?? undefined,
          next_review: row.next_review_at ?? undefined,
        },
      };
    })
};
