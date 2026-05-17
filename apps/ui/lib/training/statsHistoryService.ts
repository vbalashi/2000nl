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

  const { data, error } = await supabase
    .from("user_events")
    .select(
      "word_id, event_type, mode, created_at, word:word_entries (id, dictionary_id, language_code, headword, part_of_speech, gender, raw, is_nt2_2000, meaning_id)",
    )
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    console.error("Error fetching recent history:", error);
    return [];
  }

  type HistoryRow = {
    word_id: string;
    event_type: string;
    mode: string;
    created_at: string;
    word: {
      id: string;
      dictionary_id?: string | null;
      language_code?: string | null;
      headword: string;
      part_of_speech: string | null;
      gender: string | null;
      raw: unknown;
      is_nt2_2000: boolean | null;
      meaning_id?: number | null;
    } | null;
  };

  const rows = data as unknown as HistoryRow[];

  const wordIds = Array.from(
    new Set(
      rows
        .map((row) => row.word?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  // Map keyed by "word_id:mode" to get correct status per mode
  let statusMap = new Map<
    string,
    {
      click_count: number;
      last_seen_at: string | null;
      fsrs_last_interval: number | null;
      fsrs_reps: number | null;
      fsrs_stability: number | null;
      next_review_at: string | null;
    }
  >();

  // Collect unique dictionary-scoped headwords to fetch meanings_count
  const countScopes = Array.from(
    new Set(
      rows
        .map((row) => {
          const word = row.word;
          if (!word?.headword) return null;
          return `${word.dictionary_id ?? ""}:${word.language_code ?? ""}:${word.headword}`;
        })
        .filter((scope): scope is string => Boolean(scope)),
    ),
  );

  // Map of "dictionary_id:language_code:headword" -> meanings_count
  const meaningsCountMap = new Map<string, number>();

  if (wordIds.length > 0) {
    const { data: statusData } = await supabase
      .from("user_word_status")
      .select(
        "word_id, mode, click_count, last_seen_at, fsrs_last_interval, fsrs_reps, fsrs_stability, next_review_at",
      )
      .eq("user_id", userId)
      .in("word_id", wordIds);

    if (statusData) {
      statusData.forEach((row) => {
        const key = `${row.word_id}:${row.mode}`;
        statusMap.set(key, {
          click_count: row.click_count ?? 0,
          last_seen_at: row.last_seen_at,
          fsrs_last_interval: row.fsrs_last_interval,
          fsrs_reps: row.fsrs_reps,
          fsrs_stability: row.fsrs_stability,
          next_review_at: row.next_review_at,
        });
      });
    }

    // Fetch meanings_count inside each entry's dictionary/language scope.
    for (const scope of countScopes) {
      const [dictionaryId, languageCode, headword] = scope.split(":");
      let countQuery = supabase
        .from("word_entries")
        .select("id", { count: "exact", head: true })
        .eq("headword", headword);
      if (dictionaryId) {
        countQuery = countQuery.eq("dictionary_id", dictionaryId);
      } else if (languageCode) {
        countQuery = countQuery.eq("language_code", languageCode);
      }
      const { count } = await countQuery;
      meaningsCountMap.set(scope, count ?? 1);
    }
  }

  return rows
    .filter((row) => row.word)
    .map((row) => {
      const word = row.word;
      if (!word) {
        return null as any;
      }
      const status = statusMap.get(`${word.id}:${row.mode}`);
      const source = row.event_type === "definition_click" ? "click" : "review";
      const normalizedRaw = normalizeRaw(word.raw);
      // meaning_id can be in the JSON raw field (per schema) or as a DB column (migration 0007)
      // Prefer JSON, fall back to DB column if not present
      if (
        typeof normalizedRaw.meaning_id !== "number" &&
        typeof word.meaning_id === "number"
      ) {
        normalizedRaw.meaning_id = word.meaning_id;
      }
      return {
        id: word.id,
        ...(word.dictionary_id ? { dictionary_id: word.dictionary_id } : {}),
        ...(word.language_code ? { language_code: word.language_code } : {}),
        headword: word.headword,
        part_of_speech: word.part_of_speech ?? undefined,
        gender: word.gender ?? undefined,
        raw: normalizedRaw,
        is_nt2_2000: word.is_nt2_2000,
        meanings_count:
          meaningsCountMap.get(
            `${word.dictionary_id ?? ""}:${word.language_code ?? ""}:${word.headword}`,
          ) ?? 1,
        source: source as "click" | "review",
        result: mapEventTypeToResult(row.event_type),
        stats: status
          ? {
              click_count: status.click_count,
              last_seen_at: status.last_seen_at,
            }
          : {
              click_count: 0,
              last_seen_at: row.created_at,
            },
        debugStats: {
          source,
          mode: row.mode as TrainingMode | undefined,
          interval: status?.fsrs_last_interval ?? undefined,
          reps: status?.fsrs_reps ?? undefined,
          ef: status?.fsrs_stability ?? undefined,
          clicks: status?.click_count ?? undefined,
          next_review: status?.next_review_at ?? undefined,
        },
      };
    })
    .filter((x): x is SidebarHistoryItem => Boolean(x));
};
