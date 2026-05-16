import { supabase } from "./supabaseClient";
import { trainingDebug } from "./trainingDebug";
import {
  CardFilter,
  QueueTurn,
  ScenarioStats,
  TrainingMode,
  TrainingScenario,
  TrainingWord,
  WordRaw,
  ReviewResult,
  WordEntrySearchResult,
  WordListSummary,
  WordListType,
} from "./types";
import {
  isCrossReferenceOnly,
  mapCuratedListSummary,
  mapDictionaryEntry,
  mapEventTypeToResult,
  mapScenario,
  mapUserListSummary,
  normalizeRaw,
} from "./training/wordMappers";
export {
  fetchUserPreferences,
  updateUserPreferences,
  type UserPreferences,
} from "./training/preferencesService";
export {
  fetchDictionaryEntry,
  fetchTrainingWordById,
  fetchTrainingWordByLookup,
} from "./training/dictionaryService";
export {
  fetchLastReviewDebug,
  recordDefinitionClick,
  recordReview,
  recordWordView,
  type LastReviewDebug,
  type RecordReviewParams,
  type WordStatusAfterReview,
} from "./training/reviewService";
export { fetchRecentHistory, fetchStats } from "./training/statsHistoryService";

const EVENT_MAP: Record<ReviewResult, string> = {
  fail: "review_fail",
  hard: "review_hard",
  success: "review_success",
  easy: "review_easy",
  freeze: "freeze",
  hide: "hide",
};
const MAX_CROSS_REFERENCE_SKIPS = 5;

export { type ReviewResult } from "./types";

const parseEntry = (entry: any): WordRaw => normalizeRaw(entry?.raw ?? {});

type WordSearchFilters = {
  query?: string;
  partOfSpeech?: string;
  isNt2?: boolean;
  filterFrozen?: boolean;
  filterHidden?: boolean;
  page?: number;
  pageSize?: number;
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

  const excludedIds = new Set(excludeWordIds);

  for (let attempt = 0; attempt < MAX_CROSS_REFERENCE_SKIPS; attempt += 1) {
    rpcPayload.p_exclude_ids = Array.from(excludedIds);

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
          (w) => !excludedIds.has(w.id) && !isCrossReferenceOnly(w.raw)
        );
        const pick =
          candidates.length > 0
            ? candidates[Math.floor(Math.random() * candidates.length)]
            : null;
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

    const rawData = normalizeRaw(item.raw);
    if (isCrossReferenceOnly(rawData)) {
      excludedIds.add(item.id);
      continue;
    }

    // Debug Logging for "Why this word?" and Queue Size
    const stats = item.stats || {};
    const meaningId = rawData.meaning_id;
    const meaningLabel = typeof meaningId === "number" ? ` #${meaningId}` : "";

    // Format interval for display
    const formatInterval = (interval: number | null | undefined): string => {
      if (interval === null || interval === undefined) return "new";
      if (interval < 1) return `${(interval * 24 * 60).toFixed(0)}min`;
      if (interval < 7) return `${interval.toFixed(2)}d`;
      return `${(interval / 7).toFixed(1)}w`;
    };

    trainingDebug.groupCollapsed(
      `%c Word Selection: ${item.headword}${meaningLabel} (${stats.source || "unknown"})`,
      "color: #10b981; font-weight: bold;"
    );
    trainingDebug.log(`%c Source:`, "font-weight: bold", stats.source || "unknown");
    trainingDebug.log(`%c Mode:`, "font-weight: bold", item.mode || stats.mode || "unknown");
    if (typeof meaningId === "number") {
      trainingDebug.log(`%c Meaning ID:`, "font-weight: bold", meaningId);
    }
    trainingDebug.log(`%c Queue Turn:`, "font-weight: bold", queueTurn);
    trainingDebug.log(
      `%c New Pool:`,
      "font-weight: bold",
      `${stats.new_today ?? "?"}/${stats.daily_new_limit ?? "?"} today, ${stats.new_pool_size ?? "?"} available`
    );
    trainingDebug.log(
      `%c Learning Due:`,
      "font-weight: bold",
      stats.learning_due_count ?? "?"
    );
    trainingDebug.log(
      `%c Review Pool:`,
      "font-weight: bold",
      stats.review_pool_size ?? "?"
    );
    trainingDebug.log(`%c Interval:`, "font-weight: bold", formatInterval(stats.interval));
    trainingDebug.log(`%c Stability:`, "font-weight: bold", stats.stability ?? "new");
    trainingDebug.log(`%c Next Review:`, "font-weight: bold", stats.next_review ?? "new");
    trainingDebug.log("Full Entry:", item);
    trainingDebug.groupEnd();

    const isFirstEncounter = stats.source === "new";
    const resolvedMode = isFirstEncounter
      ? "word-to-definition"
      : item.mode || stats.mode;

    return {
      id: item.id,
      headword: item.headword,
      part_of_speech: item.part_of_speech ?? undefined,
      gender: item.gender ?? undefined,
      raw: rawData,
      vandaleId: item.vandaleId,
      debugStats: {
        ...item.stats,
        // Map RPC's 'stability' to DebugStats 'ef' for backward compatibility
        ef: item.stats?.stability ?? undefined,
      },
      is_nt2_2000: item.is_nt2_2000,
      meanings_count: item.meanings_count,
      isFirstEncounter,
      mode: resolvedMode,
    };
  }

  if (listScope?.listId) {
    const fallback = await fetchWordsForList(
      listScope.listId,
      listScope.listType ?? "curated",
      { page: 1, pageSize: 50 }
    );
    const candidates = fallback.items.filter(
      (w) => !excludedIds.has(w.id) && !isCrossReferenceOnly(w.raw)
    );
    const pick =
      candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : null;
    if (pick) {
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
};

// No longer needed: fetchUserWordStatusRow (RPC handles it)

// ============================================================================
// SCENARIO-BASED TRAINING
// ============================================================================

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

  const excludedIds = new Set(excludeWordIds);

  for (let attempt = 0; attempt < MAX_CROSS_REFERENCE_SKIPS; attempt += 1) {
    rpcPayload.p_exclude_ids = Array.from(excludedIds);

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
    if (isCrossReferenceOnly(rawData)) {
      excludedIds.add(item.id);
      continue;
    }

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

    trainingDebug.groupCollapsed(
      `%c 📚 Word Selection: ${item.headword}${meaningLabel} (${stats.source || "unknown"})`,
      "color: #10b981; font-weight: bold;"
    );
    trainingDebug.log(`%c Source:`, "font-weight: bold", stats.source || "unknown", `- ${sourceExplanation}`);
    trainingDebug.log(`%c Mode:`, "font-weight: bold", item.mode || stats.mode || "unknown");
    trainingDebug.log(`%c Queue Turn:`, "font-weight: bold", queueTurn);
    trainingDebug.log(
      `%c New Cards Today:`,
      "font-weight: bold",
      `${stats.new_today ?? "?"}/${stats.daily_new_limit ?? "?"} (${stats.new_pool_size ?? "?"} unseen words available)`
    );
    trainingDebug.log(
      `%c Learning Due:`,
      "font-weight: bold",
      `${stats.learning_due_count ?? "?"} cards in learning phase ready for review`
    );
    trainingDebug.log(
      `%c Review Pool:`,
      "font-weight: bold",
      `${stats.review_pool_size ?? "?"} graduated cards in rotation`
    );
    if (stats.interval != null) {
      trainingDebug.log(`%c Current Interval:`, "font-weight: bold", formatInterval(stats.interval), `(${stats.interval >= 1 ? "graduated" : "in learning"})`);
      trainingDebug.log(`%c Stability:`, "font-weight: bold", stats.stability ?? "n/a");
      trainingDebug.log(`%c Next Review:`, "font-weight: bold", stats.next_review ?? "n/a");
    } else {
      trainingDebug.log(`%c Status:`, "font-weight: bold", "Brand new card - no previous review data");
    }
    trainingDebug.log("Full Entry:", item);
    trainingDebug.groupEnd();

    const isFirstEncounter = stats.source === "new";
    const resolvedMode = isFirstEncounter
      ? "word-to-definition"
      : item.mode || stats.mode;

    return {
      id: item.id,
      headword: item.headword,
      part_of_speech: item.part_of_speech ?? undefined,
      gender: item.gender ?? undefined,
      raw: rawData,
      vandaleId: item.vandaleId,
      debugStats: {
        ...item.stats,
        // Map RPC's 'stability' to DebugStats 'ef' for backward compatibility
        ef: item.stats?.stability ?? undefined,
      },
      is_nt2_2000: item.is_nt2_2000,
      meanings_count: item.meanings_count,
      isFirstEncounter,
      mode: resolvedMode,
    };
  }

  return null;
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
