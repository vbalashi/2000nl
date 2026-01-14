import { supabase } from "./supabaseClient";
import {
  CardFilter,
  DetailedStats,
  DictionaryEntry,
  QueueTurn,
  ScenarioStats,
  TrainingMode,
  TrainingScenario,
  TrainingWord,
  WordRaw,
  ReviewResult,
  SidebarHistoryItem,
  WordEntrySearchResult,
  WordListSummary,
  WordListType,
} from "./types";

const EVENT_MAP: Record<ReviewResult, string> = {
  fail: "review_fail",
  hard: "review_hard",
  success: "review_success",
  easy: "review_easy",
  freeze: "freeze",
  hide: "hide",
};

export { type ReviewResult } from "./types";

const normalizeRaw = (raw: unknown): WordRaw => {
  if (!raw) {
    return {};
  }

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as WordRaw;
    } catch {
      return {};
    }
  }

  return raw as WordRaw;
};

const parseEntry = (entry: any): WordRaw => normalizeRaw(entry?.raw ?? {});

const mapDictionaryEntry = (data: any): DictionaryEntry => ({
  id: data.id,
  headword: data.headword,
  part_of_speech: data.part_of_speech ?? undefined,
  gender: data.gender ?? undefined,
  raw: normalizeRaw(data.raw),
  is_nt2_2000: data.is_nt2_2000,
});

type WordSearchFilters = {
  query?: string;
  partOfSpeech?: string;
  isNt2?: boolean;
  filterFrozen?: boolean;
  filterHidden?: boolean;
  page?: number;
  pageSize?: number;
};

const mapCuratedListSummary = (row: any): WordListSummary => ({
  id: row.id,
  name: row.name,
  description: row.description,
  language_code: row.language_code,
  type: "curated",
  item_count: row.word_list_items?.[0]?.count ?? undefined,
  is_primary: row.is_primary ?? undefined,
});

const mapUserListSummary = (row: any): WordListSummary => ({
  id: row.id,
  name: row.name,
  description: row.description,
  language_code: row.language_code,
  type: "user",
  item_count: row.user_word_list_items?.[0]?.count ?? undefined,
  created_at: row.created_at,
});

const fetchDictionaryEntryById = async (
  id: string
): Promise<DictionaryEntry | null> => {
  const { data, error } = await supabase
    .from("word_entries")
    .select("id, headword, part_of_speech, gender, raw, is_nt2_2000")
    .eq("id", id)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    console.error("Unable to fetch dictionary entry by id", error);
    return null;
  }

  return mapDictionaryEntry(data);
};

export const fetchTrainingWordById = async (
  id: string
): Promise<TrainingWord | null> => {
  const { data, error } = await supabase
    .from("word_entries")
    .select("id, headword, part_of_speech, gender, raw, is_nt2_2000")
    .eq("id", id)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("Unable to fetch training word by id", error);
    }
    return null;
  }

  return {
    id: data.id,
    headword: data.headword,
    part_of_speech: data.part_of_speech ?? undefined,
    gender: data.gender ?? undefined,
    raw: normalizeRaw(data.raw),
    is_nt2_2000: data.is_nt2_2000,
    isFirstEncounter: false,
  };
};

export const fetchTrainingWordByLookup = async (
  lookup: string
): Promise<TrainingWord | null> => {
  const normalized = lookup.trim();
  if (!normalized) {
    return null;
  }

  const byId = await fetchTrainingWordById(normalized);
  if (byId) {
    return byId;
  }

  const { data, error } = await supabase
    .from("word_entries")
    .select("id, headword, part_of_speech, gender, raw, is_nt2_2000")
    .ilike("headword", normalized)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("Unable to fetch training word by headword", error);
    }
    return null;
  }

  return {
    id: data.id,
    headword: data.headword,
    part_of_speech: data.part_of_speech ?? undefined,
    gender: data.gender ?? undefined,
    raw: normalizeRaw(data.raw),
    is_nt2_2000: data.is_nt2_2000,
    isFirstEncounter: false,
  };
};

export const fetchNextTrainingWord = async (
  userId: string,
  modes: TrainingMode[],
  excludeWordIds: string[] = [],
  listScope?: { listId?: string | null; listType?: WordListType },
  cardFilter: CardFilter = "both",
  queueTurn: QueueTurn = "auto"
): Promise<TrainingWord | null> => {
  const rpcPayload: Record<string, any> = {
    p_user_id: userId,
    p_modes: modes,
    p_exclude_ids: excludeWordIds,
    p_card_filter: cardFilter,
    p_queue_turn: queueTurn,
  };

  if (listScope?.listId) {
    rpcPayload.p_list_id = listScope.listId;
    rpcPayload.p_list_type = listScope.listType ?? "curated";
  }

  // Call the Database RPC to get the next best word
  const { data, error } = await supabase.rpc("get_next_word", rpcPayload);

  if (error || !data || data.length === 0) {
    if (error) {
      console.error("Error fetching next word via RPC", error);
    }
    // Fallback for small lists / quota reached: pick a word from the selected list
    // while honoring excludeWordIds to prevent immediate repeats.
    if (listScope?.listId) {
      const fallback = await fetchWordsForList(
        listScope.listId,
        listScope.listType ?? "curated",
        { page: 1, pageSize: 50 }
      );
      const candidates = fallback.items.filter(
        (w) => !excludeWordIds.includes(w.id)
      );
      const pick =
        candidates.length > 0
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : fallback.items[0];
      if (pick) {
        // Pick a random mode from enabled modes for fallback
        const fallbackMode = modes[Math.floor(Math.random() * modes.length)];
        return {
          id: pick.id,
          headword: pick.headword,
          part_of_speech: pick.part_of_speech ?? undefined,
          gender: pick.gender ?? undefined,
          raw: normalizeRaw(pick.raw),
          is_nt2_2000: pick.is_nt2_2000,
          meanings_count: pick.meanings_count,
          mode: fallbackMode,
          debugStats: { source: "fallback", mode: fallbackMode },
          isFirstEncounter: false,
        };
      }
    }
    return null;
  }

  // data is returned as SetOf JSONB, so it might be an array of one object or just one object depending on how Supabase client parses it.
  // Usually .rpc returns data directly. If 'setof jsonb', it returns array of objects.
  const item = Array.isArray(data) ? data[0] : data;

  if (!item) return null;

  // Debug Logging for "Why this word?" and Queue Size
  const stats = item.stats || {};
  const rawData = normalizeRaw(item.raw);
  const meaningId = rawData.meaning_id;
  const meaningLabel = typeof meaningId === "number" ? ` #${meaningId}` : "";
  
  // Format interval for display
  const formatInterval = (interval: number | null | undefined): string => {
    if (interval === null || interval === undefined) return "new";
    if (interval < 1) return `${(interval * 24 * 60).toFixed(0)}min`;
    if (interval < 7) return `${interval.toFixed(2)}d`;
    return `${(interval / 7).toFixed(1)}w`;
  };

  console.groupCollapsed(
    `%c Word Selection: ${item.headword}${meaningLabel} (${stats.source || "unknown"})`,
    "color: #10b981; font-weight: bold;"
  );
  console.log(`%c Source:`, "font-weight: bold", stats.source || "unknown");
  console.log(`%c Mode:`, "font-weight: bold", item.mode || stats.mode || "unknown");
  if (typeof meaningId === "number") {
    console.log(`%c Meaning ID:`, "font-weight: bold", meaningId);
  }
  console.log(`%c Queue Turn:`, "font-weight: bold", queueTurn);
  console.log(
    `%c New Pool:`,
    "font-weight: bold",
    `${stats.new_today ?? "?"}/${stats.daily_new_limit ?? "?"} today, ${stats.new_pool_size ?? "?"} available`
  );
  console.log(
    `%c Learning Due:`,
    "font-weight: bold",
    stats.learning_due_count ?? "?"
  );
  console.log(
    `%c Review Pool:`,
    "font-weight: bold",
    stats.review_pool_size ?? "?"
  );
  console.log(`%c Interval:`, "font-weight: bold", formatInterval(stats.interval));
  console.log(`%c Stability:`, "font-weight: bold", stats.stability ?? "new");
  console.log(`%c Next Review:`, "font-weight: bold", stats.next_review ?? "new");
  console.log("Full Entry:", item);
  console.groupEnd();

  return {
    id: item.id,
    headword: item.headword,
    part_of_speech: item.part_of_speech ?? undefined,
    gender: item.gender ?? undefined,
    raw: normalizeRaw(item.raw),
    vandaleId: item.vandaleId,
    debugStats: {
      ...item.stats,
      // Map RPC's 'stability' to DebugStats 'ef' for backward compatibility
      ef: item.stats?.stability ?? undefined,
    },
    is_nt2_2000: item.is_nt2_2000,
    meanings_count: item.meanings_count,
    isFirstEncounter: stats.source === "new",
    mode: item.mode || stats.mode,
  };
};

// No longer needed: fetchUserWordStatusRow (RPC handles it)

// ============================================================================
// SCENARIO-BASED TRAINING
// ============================================================================

const mapScenario = (data: any): TrainingScenario => ({
  id: data.id,
  nameEn: data.name_en,
  nameNl: data.name_nl ?? undefined,
  description: data.description ?? undefined,
  cardModes: data.card_modes ?? [],
  graduationThreshold: data.graduation_threshold ?? 21,
  enabled: data.enabled ?? true,
  sortOrder: data.sort_order ?? 0,
});

/**
 * Fetch all available training scenarios
 */
export const fetchTrainingScenarios = async (): Promise<TrainingScenario[]> => {
  const { data, error } = await supabase.rpc("get_training_scenarios");

  if (error || !data) {
    console.error("Error fetching training scenarios:", error);
    return [];
  }

  return (Array.isArray(data) ? data : [data]).map(mapScenario);
};

/**
 * Fetch scenario-level statistics for dashboard
 */
export const fetchScenarioStats = async (
  userId: string,
  scenarioId: string,
  listScope?: { listId?: string | null; listType?: WordListType }
): Promise<ScenarioStats | null> => {
  const payload: Record<string, any> = {
    p_user_id: userId,
    p_scenario_id: scenarioId,
  };

  if (listScope?.listId) {
    payload.p_list_id = listScope.listId;
    payload.p_list_type = listScope.listType ?? "curated";
  }

  const { data, error } = await supabase.rpc("get_scenario_stats", payload);

  if (error || !data) {
    console.error("Error fetching scenario stats:", error);
    return null;
  }

  return {
    learned: data.learned ?? 0,
    inProgress: data.in_progress ?? 0,
    new: data.new ?? 0,
    total: data.total ?? 0,
    scenarioId: data.scenario_id ?? scenarioId,
    cardModes: data.card_modes ?? [],
    graduationThreshold: data.graduation_threshold ?? 21,
  };
};

/**
 * Fetch next training word using scenario-based selection
 */
export const fetchNextTrainingWordByScenario = async (
  userId: string,
  scenarioId: string,
  excludeWordIds: string[] = [],
  listScope?: { listId?: string | null; listType?: WordListType },
  cardFilter: CardFilter = "both",
  queueTurn: QueueTurn = "auto"
): Promise<TrainingWord | null> => {
  const rpcPayload: Record<string, any> = {
    p_user_id: userId,
    p_scenario_id: scenarioId,
    p_exclude_ids: excludeWordIds,
    p_card_filter: cardFilter,
    p_queue_turn: queueTurn,
  };

  if (listScope?.listId) {
    rpcPayload.p_list_id = listScope.listId;
    rpcPayload.p_list_type = listScope.listType ?? "curated";
  }

  const { data, error } = await supabase.rpc("get_next_word", rpcPayload);

  if (error || !data || data.length === 0) {
    if (error) {
      console.error("Error fetching next word via scenario RPC:", error);
    }
    return null;
  }

  const item = Array.isArray(data) ? data[0] : data;
  if (!item) return null;

  const stats = item.stats || {};
  const rawData = normalizeRaw(item.raw);
  const meaningId = rawData.meaning_id;
  const meaningLabel = typeof meaningId === "number" ? ` #${meaningId}` : "";

  // Format interval for display
  const formatInterval = (interval: number | null | undefined): string => {
    if (interval === null || interval === undefined) return "new";
    if (interval < 1) return `${(interval * 24 * 60).toFixed(0)}min`;
    if (interval < 7) return `${interval.toFixed(2)}d`;
    return `${(interval / 7).toFixed(1)}w`;
  };

  // Determine what this card means for the counters
  const sourceExplanationMap: Record<string, string> = {
    new: "First time seeing this word → will count toward NIEUW",
    learning: "Still learning (interval < 1 day) → counts toward HERHALING when reviewed",
    review: "Graduated card due for review → counts toward HERHALING when reviewed",
    practice: "Practice mode (no card due) → no counter change",
    fallback: "Fallback selection → depends on card state",
  };
  const sourceKey = typeof stats.source === "string" ? stats.source : "unknown";
  const sourceExplanation = sourceExplanationMap[sourceKey] || "Unknown source";

  console.groupCollapsed(
    `%c 📚 Word Selection: ${item.headword}${meaningLabel} (${stats.source || "unknown"})`,
    "color: #10b981; font-weight: bold;"
  );
  console.log(`%c Source:`, "font-weight: bold", stats.source || "unknown", `- ${sourceExplanation}`);
  console.log(`%c Mode:`, "font-weight: bold", item.mode || stats.mode || "unknown");
  console.log(`%c Queue Turn:`, "font-weight: bold", queueTurn);
  console.log(
    `%c New Cards Today:`,
    "font-weight: bold",
    `${stats.new_today ?? "?"}/${stats.daily_new_limit ?? "?"} (${stats.new_pool_size ?? "?"} unseen words available)`
  );
  console.log(
    `%c Learning Due:`,
    "font-weight: bold",
    `${stats.learning_due_count ?? "?"} cards in learning phase ready for review`
  );
  console.log(
    `%c Review Pool:`,
    "font-weight: bold",
    `${stats.review_pool_size ?? "?"} graduated cards in rotation`
  );
  if (stats.interval != null) {
    console.log(`%c Current Interval:`, "font-weight: bold", formatInterval(stats.interval), `(${stats.interval >= 1 ? "graduated" : "in learning"})`);
    console.log(`%c Stability:`, "font-weight: bold", stats.stability ?? "n/a");
    console.log(`%c Next Review:`, "font-weight: bold", stats.next_review ?? "n/a");
  } else {
    console.log(`%c Status:`, "font-weight: bold", "Brand new card - no previous review data");
  }
  console.log("Full Entry:", item);
  console.groupEnd();

  return {
    id: item.id,
    headword: item.headword,
    part_of_speech: item.part_of_speech ?? undefined,
    gender: item.gender ?? undefined,
    raw: normalizeRaw(item.raw),
    vandaleId: item.vandaleId,
    debugStats: {
      ...item.stats,
      // Map RPC's 'stability' to DebugStats 'ef' for backward compatibility
      ef: item.stats?.stability ?? undefined,
    },
    is_nt2_2000: item.is_nt2_2000,
    meanings_count: item.meanings_count,
    isFirstEncounter: stats.source === "new",
    mode: item.mode || stats.mode,
  };
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

  const { error } = await supabase.from("user_word_status").upsert(
    {
      user_id: params.userId,
      word_id: params.wordId,
      mode: params.mode,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,word_id,mode" }
  );
};

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

export const recordReview = async (params: {
  userId: string;
  wordId: string;
  mode: TrainingMode;
  result: ReviewResult;
}): Promise<WordStatusAfterReview | null> => {
  const { error } = await supabase.rpc("handle_review", {
    p_user_id: params.userId,
    p_word_id: params.wordId,
    p_mode: params.mode,
    p_result: params.result,
  });

  if (error) {
    console.error("Error recording review via RPC", error);
    return null;
  }

  // Fetch the updated status after the review to get new FSRS values
  // Note: in_learning and learning_due_at require migration 0015
  const { data: statusData, error: fetchError } = await supabase
    .from("user_word_status")
    .select("fsrs_last_interval, fsrs_reps, fsrs_stability, click_count, next_review_at")
    .eq("user_id", params.userId)
    .eq("word_id", params.wordId)
    .eq("mode", params.mode)
    .maybeSingle();

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
    in_learning: null,
    learning_due_at: null,
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
    console.warn("Could not fetch last review debug:", error.message);
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
  if (!params.wordId) return;

  const { error } = await supabase.rpc("handle_click", {
    p_user_id: params.userId,
    p_word_id: params.wordId,
    p_mode: params.mode,
  });

  if (error) {
    console.error("Error recording click via RPC", error);
  }
};

export const fetchDictionaryEntry = async (
  headword: string,
  userId?: string
): Promise<
  | (DictionaryEntry & {
      stats?: { click_count: number; last_seen_at: string | null };
    })
  | null
> => {
  const normalized = (headword || "").trim();
  if (!normalized) return null;

  const tryFetchByHeadword = async (value: string) => {
    const { data, error } = await supabase
      .from("word_entries")
      .select("id, headword, part_of_speech, gender, raw, is_nt2_2000")
      .eq("headword", value)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    // Get count of siblings
    const { count } = await supabase
      .from("word_entries")
      .select("id", { count: "exact", head: true })
      .eq("headword", value);

    return { ...mapDictionaryEntry(data), meanings_count: count ?? 1 };
  };

  // 1) Exact headword match (case sensitive, then case-insensitive via lowercase).
  const directMatch =
    (await tryFetchByHeadword(normalized)) ??
    (normalized.toLowerCase() !== normalized
      ? await tryFetchByHeadword(normalized.toLowerCase())
      : null);
  if (directMatch) {
    if (userId) {
      const { data: statsData } = await supabase
        .from("user_word_status")
        .select("click_count, last_seen_at")
        .eq("user_id", userId)
        .eq("word_id", directMatch.id)
        .maybeSingle();

      if (statsData) {
        return { ...directMatch, stats: statsData };
      }
    }
    return directMatch;
  }

  // 2) Fallback to word_forms mapping (normalized to lowercase).
  const { data: formRow, error: formError } = await supabase
    .from("word_forms")
    .select("word_id, headword")
    .eq("form", normalized.toLowerCase())
    .order("headword", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (formError) {
    console.error("Unable to query word_forms", formError);
  }

  if (!formRow?.word_id) {
    console.log("No dictionary entry found for:", normalized);
    return null;
  }

  const entry = await fetchDictionaryEntryById(formRow.word_id);
  if (!entry) return null;

  if (userId) {
    const { data: statsData } = await supabase
      .from("user_word_status")
      .select("click_count, last_seen_at")
      .eq("user_id", userId)
      .eq("word_id", entry.id)
      .maybeSingle();

    if (statsData) {
      return { ...entry, stats: statsData };
    }
  }

  return entry;
};

export async function fetchStats(
  userId: string,
  modes: TrainingMode[],
  listScope?: { listId?: string | null; listType?: WordListType },
  logContext?: string
): Promise<DetailedStats> {
  const payload: Record<string, any> = {
    p_user_id: userId,
    p_modes: modes,
  };

  if (listScope?.listId) {
    payload.p_list_id = listScope.listId;
    payload.p_list_type = listScope.listType ?? "curated";
  }

  const { data, error } = await supabase.rpc("get_detailed_training_stats", payload);

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
    console.log(
      `%c 📊 Stats [${logContext}]:`,
      "color: #8b5cf6; font-weight: bold;",
      `NIEUW: ${stats.newCardsToday}/${stats.dailyNewLimit}`,
      `| HERHALING: ${stats.reviewCardsDone}/${stats.reviewCardsDone + stats.reviewCardsDue}`,
      `| TOTAAL: ${stats.totalWordsLearned}/${stats.totalWordsInList}`
    );
  }

  return stats;
}

const mapEventTypeToResult = (
  eventType: string
): SidebarHistoryItem["result"] => {
  if (eventType === "review_fail") return "fail";
  if (eventType === "review_hard") return "hard";
  if (eventType === "review_success") return "success";
  if (eventType === "review_easy") return "easy";
  return "neutral";
};

export const fetchRecentHistory = async (
  userId: string
): Promise<SidebarHistoryItem[]> => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("user_events")
    .select(
      "word_id, event_type, mode, created_at, word:word_entries (id, headword, part_of_speech, gender, raw, is_nt2_2000, meaning_id)"
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
        .filter((id): id is string => Boolean(id))
    )
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

  // Collect unique headwords to fetch meanings_count
  const headwords = Array.from(
    new Set(
      rows
        .map((row) => row.word?.headword)
        .filter((h): h is string => Boolean(h))
    )
  );

  // Map of headword -> meanings_count
  const meaningsCountMap = new Map<string, number>();

  if (wordIds.length > 0) {
    const { data: statusData } = await supabase
      .from("user_word_status")
      .select("word_id, mode, click_count, last_seen_at, fsrs_last_interval, fsrs_reps, fsrs_stability, next_review_at")
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

    // Fetch meanings_count for each headword
    if (headwords.length > 0) {
      const { data: countData } = await supabase
        .from("word_entries")
        .select("headword")
        .in("headword", headwords);

      if (countData) {
        // Count occurrences of each headword
        countData.forEach((row) => {
          meaningsCountMap.set(row.headword, (meaningsCountMap.get(row.headword) ?? 0) + 1);
        });
      }
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
      if (typeof normalizedRaw.meaning_id !== "number" && typeof word.meaning_id === "number") {
        normalizedRaw.meaning_id = word.meaning_id;
      }
      return {
        id: word.id,
        headword: word.headword,
        part_of_speech: word.part_of_speech ?? undefined,
        gender: word.gender ?? undefined,
        raw: normalizedRaw,
        is_nt2_2000: word.is_nt2_2000,
        meanings_count: meaningsCountMap.get(word.headword) ?? 1,
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

export async function fetchCuratedLists(
  languageCode?: string
): Promise<WordListSummary[]> {
  const baseSelect =
    "id, name, description, language_code, is_primary, word_list_items(count)";

  // Prefer sort_order when available (migration 0039), but gracefully
  // fall back for older DBs where the column doesn't exist.
  const run = async (withSortOrder: boolean) => {
    let query = supabase
      .from("word_lists")
      .select(
        withSortOrder ? `${baseSelect}, sort_order` : baseSelect
      )
      .order(withSortOrder ? "sort_order" : "is_primary", {
        ascending: withSortOrder ? true : false,
        nullsFirst: withSortOrder ? false : undefined,
      })
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true });

    if (languageCode) {
      query = query.eq("language_code", languageCode);
    }

    return await query;
  };

  const first = await run(true);
  if (!first.error && first.data) {
    return first.data.map(mapCuratedListSummary);
  }

  // Retry without sort_order if the first query failed (e.g. missing column).
  if (first.error) {
    console.warn("fetchCuratedLists: falling back without sort_order", first.error);
  }

  const fallback = await run(false);
  if (fallback.error || !fallback.data) return [];
  return fallback.data.map(mapCuratedListSummary);
}

export async function fetchUserLists(
  userId: string,
  languageCode?: string
): Promise<WordListSummary[]> {
  let query = supabase
    .from("user_word_lists")
    .select(
      "id, name, description, language_code, created_at, user_word_list_items(count)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (languageCode) {
    query = query.eq("language_code", languageCode);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(mapUserListSummary);
}

export async function fetchAvailableLists(
  userId: string,
  languageCode?: string
): Promise<WordListSummary[]> {
  const [curated, user] = await Promise.all([
    fetchCuratedLists(languageCode),
    fetchUserLists(userId, languageCode),
  ]);
  return [...curated, ...user];
}

export async function searchWordEntries(
  filters: WordSearchFilters = {}
): Promise<WordEntrySearchResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 50;

  // Use gated RPC that enforces subscription tier limits (migration 0038).
  // If the RPC isn't deployed yet, fall back to a direct query.
  const { data, error } = await supabase.rpc("search_word_entries_gated", {
    p_query: filters.query || null,
    p_part_of_speech: filters.partOfSpeech || null,
    p_is_nt2: typeof filters.isNt2 === "boolean" ? filters.isNt2 : null,
    p_filter_frozen:
      typeof filters.filterFrozen === "boolean" ? filters.filterFrozen : null,
    p_filter_hidden:
      typeof filters.filterHidden === "boolean" ? filters.filterHidden : null,
    p_page: page,
    p_page_size: pageSize,
  });

  if (!error && data) {
    // RPC returns { items, total, is_locked, max_allowed }
    const result = data as {
      items: any[];
      total: number;
      is_locked: boolean;
      max_allowed: number | null;
    };

    return {
      items: (result.items || []).map(mapDictionaryEntry),
      total: result.total ?? 0,
      isLocked: result.is_locked,
      maxAllowed: result.max_allowed,
    };
  }

  if (error) {
    console.warn("searchWordEntries: falling back without gated RPC", error);
  }

  const offset = (page - 1) * pageSize;
  const limitEnd = offset + pageSize - 1;

  // If we need user-specific filters, we need the authed user id.
  let authedUserId: string | null = null;
  if (filters.filterHidden || filters.filterFrozen) {
    const { data: userData } = await supabase.auth.getUser();
    authedUserId = userData?.user?.id ?? null;
  }

  let allowedIds: string[] | null = null;
  if ((filters.filterHidden || filters.filterFrozen) && authedUserId) {
    const idSets: Array<Set<string>> = [];

    if (filters.filterHidden) {
      const { data: hiddenRows } = await supabase
        .from("user_word_status")
        .select("word_id")
        .eq("user_id", authedUserId)
        .eq("hidden", true);
      idSets.push(new Set((hiddenRows ?? []).map((r: any) => r.word_id).filter(Boolean)));
    }

    if (filters.filterFrozen) {
      const { data: frozenRows } = await supabase
        .from("user_word_status")
        .select("word_id")
        .eq("user_id", authedUserId)
        .gt("frozen_until", new Date().toISOString());
      idSets.push(new Set((frozenRows ?? []).map((r: any) => r.word_id).filter(Boolean)));
    }

    if (idSets.length > 0) {
      // Intersect all sets
      let acc = idSets[0];
      for (let i = 1; i < idSets.length; i++) {
        const next = new Set<string>();
        for (const id of acc) {
          if (idSets[i].has(id)) next.add(id);
        }
        acc = next;
      }
      allowedIds = Array.from(acc);
      if (allowedIds.length === 0) {
        return { items: [], total: 0 };
      }
    }
  }

  let query = supabase
    .from("word_entries")
    .select("id, headword, part_of_speech, gender, raw, is_nt2_2000", {
      count: "exact",
    })
    .order("headword", { ascending: true });

  if (filters.query) {
    query = query.ilike("headword", `%${filters.query}%`);
  }
  if (filters.partOfSpeech) {
    query = query.eq("part_of_speech", filters.partOfSpeech);
  }
  if (typeof filters.isNt2 === "boolean") {
    query = query.eq("is_nt2_2000", filters.isNt2);
  }
  if (allowedIds) {
    query = query.in("id", allowedIds);
  }

  const { data: rows, count, error: qError } = await query.range(offset, limitEnd);
  if (qError || !rows) {
    console.error("Error searching word entries (fallback)", qError);
    return { items: [], total: 0 };
  }

  return {
    items: rows.map(mapDictionaryEntry),
    total: count ?? rows.length,
    isLocked: false,
    maxAllowed: null,
  };
}

export async function fetchWordsForList(
  listId: string,
  listType: WordListType,
  filters: WordSearchFilters = {}
): Promise<WordEntrySearchResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 50;

  // Use gated RPC that enforces subscription tier limits (migration 0038).
  // If the RPC isn't deployed yet, fall back to a direct join query.
  const { data, error } = await supabase.rpc("fetch_words_for_list_gated", {
    p_list_id: listId,
    p_list_type: listType,
    p_query: filters.query || null,
    p_part_of_speech: filters.partOfSpeech || null,
    p_is_nt2: typeof filters.isNt2 === "boolean" ? filters.isNt2 : null,
    p_filter_frozen:
      typeof filters.filterFrozen === "boolean" ? filters.filterFrozen : null,
    p_filter_hidden:
      typeof filters.filterHidden === "boolean" ? filters.filterHidden : null,
    p_page: page,
    p_page_size: pageSize,
  });

  if (!error && data) {
    const result = data as {
      items: any[];
      total: number;
      is_locked: boolean;
      max_allowed: number | null;
    };

    return {
      items: (result.items || []).map(mapDictionaryEntry),
      total: result.total ?? 0,
      isLocked: result.is_locked,
      maxAllowed: result.max_allowed,
    };
  }

  if (error) {
    console.warn("fetchWordsForList: falling back without gated RPC", error);
  }

  const offset = (page - 1) * pageSize;
  const limitEnd = offset + pageSize - 1;

  // Determine user id for user-specific filters (hidden/frozen) and ownership checks.
  let authedUserId: string | null = null;
  if (listType === "user" || filters.filterHidden || filters.filterFrozen) {
    const { data: userData } = await supabase.auth.getUser();
    authedUserId = userData?.user?.id ?? null;
  }

  // If we're querying a user list but can't resolve the authed user, return empty.
  if (listType === "user" && !authedUserId) {
    return { items: [], total: 0 };
  }

  // Use PostgREST joins so filters apply to word_entries server-side.
  if (listType === "curated") {
    let q = supabase
      .from("word_list_items")
      .select(
        "rank, word_entries!inner(id, headword, part_of_speech, gender, raw, is_nt2_2000)",
        { count: "exact" }
      )
      .eq("list_id", listId)
      .order("rank", { ascending: true, nullsFirst: false })
      .order("word_entries.headword", { ascending: true });

    if (filters.query) {
      q = q.ilike("word_entries.headword", `%${filters.query}%`);
    }
    if (filters.partOfSpeech) {
      q = q.eq("word_entries.part_of_speech", filters.partOfSpeech);
    }
    if (typeof filters.isNt2 === "boolean") {
      q = q.eq("word_entries.is_nt2_2000", filters.isNt2);
    }

    const { data: rows, count, error: qError } = await q.range(offset, limitEnd);
    if (qError || !rows) {
      console.error("Error fetching words for curated list (fallback)", qError);
      return { items: [], total: 0 };
    }

    const items = rows
      .map((row: any) => row?.word_entries)
      .filter(Boolean)
      .map(mapDictionaryEntry);

    return { items, total: count ?? items.length, isLocked: false, maxAllowed: null };
  }

  // listType === "user"
  let q = supabase
    .from("user_word_list_items")
    .select(
      "added_at, word_entries!inner(id, headword, part_of_speech, gender, raw, is_nt2_2000)",
      { count: "exact" }
    )
    .eq("list_id", listId)
    .order("added_at", { ascending: false })
    .order("word_entries.headword", { ascending: true });

  if (filters.query) {
    q = q.ilike("word_entries.headword", `%${filters.query}%`);
  }
  if (filters.partOfSpeech) {
    q = q.eq("word_entries.part_of_speech", filters.partOfSpeech);
  }
  if (typeof filters.isNt2 === "boolean") {
    q = q.eq("word_entries.is_nt2_2000", filters.isNt2);
  }

  // Hidden/frozen filters require user_word_status; do a client-side filter if requested.
  // This is only used when the gated RPC is unavailable.
  let allowedIds: Set<string> | null = null;
  if ((filters.filterHidden || filters.filterFrozen) && authedUserId) {
    const idSets: Array<Set<string>> = [];

    if (filters.filterHidden) {
      const { data: hiddenRows } = await supabase
        .from("user_word_status")
        .select("word_id")
        .eq("user_id", authedUserId)
        .eq("hidden", true);
      idSets.push(new Set((hiddenRows ?? []).map((r: any) => r.word_id).filter(Boolean)));
    }

    if (filters.filterFrozen) {
      const { data: frozenRows } = await supabase
        .from("user_word_status")
        .select("word_id")
        .eq("user_id", authedUserId)
        .gt("frozen_until", new Date().toISOString());
      idSets.push(new Set((frozenRows ?? []).map((r: any) => r.word_id).filter(Boolean)));
    }

    if (idSets.length > 0) {
      let acc = idSets[0];
      for (let i = 1; i < idSets.length; i++) {
        const next = new Set<string>();
        for (const id of acc) {
          if (idSets[i].has(id)) next.add(id);
        }
        acc = next;
      }
      allowedIds = acc;
    }
  }

  const { data: rows, count, error: qError } = await q.range(offset, limitEnd);
  if (qError || !rows) {
    console.error("Error fetching words for user list (fallback)", qError);
    return { items: [], total: 0 };
  }

  const filtered = allowedIds
    ? rows.filter((row: any) => allowedIds!.has(row?.word_entries?.id))
    : rows;

  const items = filtered
    .map((row: any) => row?.word_entries)
    .filter(Boolean)
    .map(mapDictionaryEntry);

  return { items, total: count ?? items.length, isLocked: false, maxAllowed: null };
}

export async function removeWordsFromUserList(
  listId: string,
  wordIds: string[]
): Promise<{ error: any }> {
  if (!wordIds.length) return { error: null };

  const { error } = await supabase
    .from("user_word_list_items")
    .delete()
    .eq("list_id", listId)
    .in("word_id", wordIds);

  if (error) {
    console.error("Error removing words from list", error);
  }
  return { error };
}

export async function deleteUserList(
  listId: string
): Promise<{ error: any }> {
  const { error } = await supabase
    .from("user_word_lists")
    .delete()
    .eq("id", listId);

  if (error) {
    console.error("Error deleting user list", error);
  }
  return { error };
}

export async function createUserList(params: {
  userId: string;
  name: string;
  description?: string;
  language_code?: string;
}): Promise<WordListSummary | null> {
  const { data, error } = await supabase
    .from("user_word_lists")
    .insert({
      user_id: params.userId,
      name: params.name,
      description: params.description,
      language_code: params.language_code,
    })
    .select(
      "id, name, description, language_code, created_at, user_word_list_items(count)"
    )
    .maybeSingle();

  if (error || !data) {
    console.error("Error creating user list", error);
    return null;
  }

  return mapUserListSummary(data);
}

export async function addWordsToUserList(
  listId: string,
  wordIds: string[]
): Promise<{ error: any }> {
  if (!wordIds.length) {
    return { error: null };
  }

  const rows = wordIds.map((id) => ({
    list_id: listId,
    word_id: id,
  }));

  // Use upsert to avoid duplicates (unique constraint on list_id,word_id).
  const { error } = await supabase.from("user_word_list_items").upsert(rows, {
    onConflict: "list_id,word_id",
    ignoreDuplicates: true,
  });

  if (error) {
    console.error("Error adding words to list", error);
  }
  return { error };
}

/**
 * Fetch which of the given wordIds are already in a user list.
 * Returns a Set of word_ids that are present in the list.
 */
export async function fetchUserListMembership(
  listId: string,
  wordIds: string[]
): Promise<Set<string>> {
  if (!wordIds.length) return new Set();

  const { data, error } = await supabase
    .from("user_word_list_items")
    .select("word_id")
    .eq("list_id", listId)
    .in("word_id", wordIds);

  if (error) {
    console.error("Error fetching user list membership", error);
    return new Set();
  }

  const ids = (data ?? [])
    .map((row: any) => row?.word_id)
    .filter((id: any): id is string => typeof id === "string" && id.length > 0);

  return new Set(ids);
}

export async function fetchActiveList(
  userId: string
): Promise<{ listId: string | null; listType: WordListType | null }> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("active_list_id, active_list_type")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching active list", error);
  }

  return {
    listId: data?.active_list_id ?? null,
    listType: (data?.active_list_type as WordListType | null) ?? null,
  };
}

export async function fetchListSummaryById(params: {
  userId: string;
  listId: string;
  listType: WordListType;
}): Promise<WordListSummary | null> {
  if (params.listType === "user") {
    const { data, error } = await supabase
      .from("user_word_lists")
      .select(
        "id, name, description, language_code, created_at, user_word_list_items(count)"
      )
      .eq("id", params.listId)
      .eq("user_id", params.userId)
      .maybeSingle();

    if (error || !data) {
      if (error) {
        console.error("Error fetching user list summary", error);
      }
      return null;
    }
    return mapUserListSummary(data);
  }

  const { data, error } = await supabase
    .from("word_lists")
    .select("id, name, description, language_code, is_primary, word_list_items(count)")
    .eq("id", params.listId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("Error fetching curated list summary", error);
    }
    return null;
  }

  return mapCuratedListSummary(data);
}

export async function updateActiveList(params: {
  userId: string;
  listId: string | null;
  listType?: WordListType | null;
}) {
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: params.userId,
      active_list_id: params.listId,
      active_list_type: params.listId
        ? params.listType ?? "curated"
        : null,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("Error updating active list", error);
  }

  return { error };
}

export type UserPreferences = {
  themePreference: "light" | "dark" | "system";
  modesEnabled: TrainingMode[];
  cardFilter: CardFilter;
  languageCode: string;
  newReviewRatio: number;
  /** Active scenario for training (e.g., 'understanding', 'listening') */
  activeScenario: string;
  /** Target language for dictionary tooltips (null = disabled) */
  translationLang: string | null;
  /** Whether the training sidebar is pinned open on desktop */
  trainingSidebarPinned: boolean;
  /** @deprecated Use modesEnabled instead */
  trainingMode?: TrainingMode;
};

export async function fetchUserPreferences(
  userId: string
): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from("user_settings")
    .select(
      "theme_preference, training_mode, modes_enabled, card_filter, language_code, new_review_ratio, active_scenario, translation_lang, training_sidebar_pinned"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user preferences", error);
  }

  // Translations:
  // - Default to English ("en") when unset/legacy NULL.
  // - Allow explicit "off" via sentinel value stored in DB.
  const translationLang =
    data?.translation_lang === "off" ? "off" : data?.translation_lang ?? "en";

  // Support both new modes_enabled array and legacy training_mode
  let modesEnabled: TrainingMode[] = data?.modes_enabled ?? [];
  if (modesEnabled.length === 0 && data?.training_mode) {
    modesEnabled = [data.training_mode as TrainingMode];
  }
  if (modesEnabled.length === 0) {
    modesEnabled = ["word-to-definition"];
  }

  return {
    themePreference: data?.theme_preference ?? "system",
    modesEnabled,
    cardFilter: (data?.card_filter as CardFilter) ?? "both",
    languageCode: data?.language_code ?? "nl",
    newReviewRatio: data?.new_review_ratio ?? 2,
    activeScenario: data?.active_scenario ?? "understanding",
    translationLang,
    trainingSidebarPinned: Boolean(data?.training_sidebar_pinned ?? false),
    trainingMode: modesEnabled[0],
  };
}

export async function updateUserPreferences(params: {
  userId: string;
  themePreference?: "light" | "dark" | "system";
  modesEnabled?: TrainingMode[];
  cardFilter?: CardFilter;
  languageCode?: string;
  newReviewRatio?: number;
  activeScenario?: string;
  translationLang?: string | null;
  trainingSidebarPinned?: boolean;
  /** @deprecated Use modesEnabled instead */
  trainingMode?: TrainingMode;
}): Promise<{ error: any }> {
  const updates: Record<string, any> = {
    user_id: params.userId,
  };

  if (params.themePreference !== undefined) {
    updates.theme_preference = params.themePreference;
  }
  if (params.modesEnabled !== undefined) {
    updates.modes_enabled = params.modesEnabled;
    // Also update legacy training_mode for backward compatibility
    updates.training_mode = params.modesEnabled[0] ?? "word-to-definition";
  }
  if (params.cardFilter !== undefined) {
    updates.card_filter = params.cardFilter;
  }
  if (params.languageCode !== undefined) {
    updates.language_code = params.languageCode;
  }
  if (params.newReviewRatio !== undefined) {
    updates.new_review_ratio = params.newReviewRatio;
  }
  if (params.activeScenario !== undefined) {
    updates.active_scenario = params.activeScenario;
  }
  if (params.translationLang !== undefined) {
    updates.translation_lang = params.translationLang;
  }
  if (params.trainingSidebarPinned !== undefined) {
    updates.training_sidebar_pinned = params.trainingSidebarPinned;
  }
  // Handle legacy trainingMode parameter
  if (params.trainingMode !== undefined && params.modesEnabled === undefined) {
    updates.training_mode = params.trainingMode;
    updates.modes_enabled = [params.trainingMode];
  }

  const { error } = await supabase
    .from("user_settings")
    .upsert(updates, { onConflict: "user_id" });

  if (error) {
    console.error("Error updating user preferences", error);
  }

  return { error };
}
