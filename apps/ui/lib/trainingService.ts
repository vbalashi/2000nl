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
  WordListType,
} from "./types";
import {
  isCrossReferenceOnly,
  mapScenario,
  normalizeRaw,
} from "./training/wordMappers";
import { fetchWordsForList } from "./training/listService";
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
export {
  fetchActiveList,
  fetchAvailableLists,
  fetchCuratedLists,
  fetchUserListMembership,
  fetchListSummaryById,
  fetchUserLists,
  fetchWordsForList,
  searchWordEntries,
  removeWordsFromUserList,
  deleteUserList,
  createUserList,
  addWordsToUserList,
  updateActiveList,
} from "./training/listService";

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
