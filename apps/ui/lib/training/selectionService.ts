import { supabase } from "../supabaseClient";
import { trainingDebug } from "../trainingDebug";
import type {
  CardFilter,
  QueueTurn,
  ScenarioStats,
  TrainingMode,
  TrainingScenario,
  TrainingWord,
  WordListType,
} from "../types";
import {
  isCrossReferenceOnly,
  mapScenario,
  normalizeRaw,
} from "./wordMappers";

const MAX_CROSS_REFERENCE_SKIPS = 5;
const DEFAULT_SCENARIO_MODES: TrainingMode[] = ["word-to-definition"];
const SUPPORTED_CARD_MODES = new Set<TrainingMode>([
  "word-to-definition",
  "definition-to-word",
  "listen-recognize",
]);

const formatInterval = (interval: number | null | undefined): string => {
  if (interval === null || interval === undefined) return "new";
  if (interval < 1) return `${(interval * 24 * 60).toFixed(0)}min`;
  if (interval < 7) return `${interval.toFixed(2)}d`;
  return `${(interval / 7).toFixed(1)}w`;
};

const mapSelectionItem = (
  item: any,
  rawData: ReturnType<typeof normalizeRaw>,
): TrainingWord => {
  const stats = item.stats || {};
  const isFirstEncounter = stats.source === "new";
  const resolvedMode = item.mode || stats.mode || "word-to-definition";

  return {
    id: item.id,
    ...(item.dictionary_id ? { dictionary_id: item.dictionary_id } : {}),
    ...(item.language_code ? { language_code: item.language_code } : {}),
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
};

export const fetchNextTrainingWord = async (
  userId: string,
  modes: TrainingMode[],
  excludeWordIds: string[] = [],
  listScope?: { listId?: string | null; listType?: WordListType },
  cardFilter: CardFilter = "both",
  queueTurn: QueueTurn = "auto",
  excludeCardKeys: string[] = [],
): Promise<TrainingWord | null> => {
  const rpcPayload: Record<string, any> = {
    p_user_id: userId,
    p_card_type_ids: modes,
    p_exclude_entry_ids: excludeWordIds,
    p_exclude_card_keys: excludeCardKeys,
    p_card_filter: cardFilter,
    p_queue_turn: queueTurn,
  };

  if (listScope?.listId) {
    rpcPayload.p_list_id = listScope.listId;
    rpcPayload.p_list_type = listScope.listType ?? "curated";
  }

  const excludedIds = new Set(excludeWordIds);
  const excludedCardKeys = new Set(excludeCardKeys);

  for (let attempt = 0; attempt < MAX_CROSS_REFERENCE_SKIPS; attempt += 1) {
    rpcPayload.p_exclude_entry_ids = Array.from(excludedIds);
    rpcPayload.p_exclude_card_keys = Array.from(excludedCardKeys);

    const { data, error } = await supabase.rpc("get_next_card", rpcPayload);

    if (error || !data || data.length === 0) {
      if (error) {
        console.error("Error fetching next word via RPC", error);
      }
      return null;
    }

    const item = Array.isArray(data) ? data[0] : data;
    if (!item) return null;

    const rawData = normalizeRaw(item.raw);
    if (isCrossReferenceOnly(rawData)) {
      excludedIds.add(item.id);
      continue;
    }

    const stats = item.stats || {};
    const meaningId = rawData.meaning_id;
    const meaningLabel = typeof meaningId === "number" ? ` #${meaningId}` : "";

    trainingDebug.groupCollapsed(
      `%c Word Selection: ${item.headword}${meaningLabel} (${stats.source || "unknown"})`,
      "color: #10b981; font-weight: bold;",
    );
    trainingDebug.log(
      `%c Source:`,
      "font-weight: bold",
      stats.source || "unknown",
    );
    trainingDebug.log(
      `%c Mode:`,
      "font-weight: bold",
      item.mode || stats.mode || "unknown",
    );
    if (typeof meaningId === "number") {
      trainingDebug.log(`%c Meaning ID:`, "font-weight: bold", meaningId);
    }
    trainingDebug.log(`%c Queue Turn:`, "font-weight: bold", queueTurn);
    trainingDebug.log(
      `%c New Pool:`,
      "font-weight: bold",
      `${stats.new_today ?? "?"}/${stats.daily_new_limit ?? "?"} today, ${stats.new_pool_size ?? "?"} available`,
    );
    trainingDebug.log(
      `%c Learning Due:`,
      "font-weight: bold",
      stats.learning_due_count ?? "?",
    );
    trainingDebug.log(
      `%c Review Pool:`,
      "font-weight: bold",
      stats.review_pool_size ?? "?",
    );
    trainingDebug.log(
      `%c Interval:`,
      "font-weight: bold",
      formatInterval(stats.interval),
    );
    trainingDebug.log(
      `%c Stability:`,
      "font-weight: bold",
      stats.stability ?? "new",
    );
    trainingDebug.log(
      `%c Next Review:`,
      "font-weight: bold",
      stats.next_review ?? "new",
    );
    trainingDebug.log("Full Entry:", item);
    trainingDebug.groupEnd();

    return mapSelectionItem(item, rawData);
  }

  return null;
};

export const fetchTrainingScenarios = async (): Promise<TrainingScenario[]> => {
  const { data, error } = await supabase.rpc("get_training_scenarios");

  if (error || !data) {
    console.error("Error fetching training scenarios:", error);
    return [];
  }

  return (Array.isArray(data) ? data : [data]).map(mapScenario);
};

const resolveScenarioModes = async (
  scenarioId: string,
): Promise<TrainingMode[] | null> => {
  const scenarios = await fetchTrainingScenarios();
  const scenario = scenarios.find((item) => item.id === scenarioId);

  if (!scenario) {
    console.error("Unable to resolve training scenario modes:", scenarioId);
    return null;
  }

  const rawModes = scenario.cardModes.filter(Boolean);
  const modes = rawModes
    .filter((mode): mode is TrainingMode =>
      SUPPORTED_CARD_MODES.has(mode as TrainingMode),
    );
  if (rawModes.length > 0 && modes.length === 0) {
    return null;
  }
  return modes.length > 0 ? modes : DEFAULT_SCENARIO_MODES;
};

export const fetchScenarioStats = async (
  userId: string,
  scenarioId: string,
  listScope?: { listId?: string | null; listType?: WordListType },
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

export const fetchNextTrainingWordByScenario = async (
  userId: string,
  scenarioId: string,
  excludeWordIds: string[] = [],
  listScope?: { listId?: string | null; listType?: WordListType },
  cardFilter: CardFilter = "both",
  queueTurn: QueueTurn = "auto",
  excludeCardKeys: string[] = [],
  modeOverride?: TrainingMode[],
): Promise<TrainingWord | null> => {
  const scenarioModes = await resolveScenarioModes(scenarioId);
  if (!scenarioModes) return null;
  const modes = modeOverride ?? scenarioModes;
  if (modes.length === 0) return null;

  const rpcPayload: Record<string, any> = {
    p_user_id: userId,
    p_card_type_ids: modes,
    p_exclude_entry_ids: excludeWordIds,
    p_exclude_card_keys: excludeCardKeys,
    p_card_filter: cardFilter,
    p_queue_turn: queueTurn,
  };

  if (listScope?.listId) {
    rpcPayload.p_list_id = listScope.listId;
    rpcPayload.p_list_type = listScope.listType ?? "curated";
  }

  const excludedIds = new Set(excludeWordIds);
  const excludedCardKeys = new Set(excludeCardKeys);

  for (let attempt = 0; attempt < MAX_CROSS_REFERENCE_SKIPS; attempt += 1) {
    rpcPayload.p_exclude_entry_ids = Array.from(excludedIds);
    rpcPayload.p_exclude_card_keys = Array.from(excludedCardKeys);

    const { data, error } = await supabase.rpc("get_next_card", rpcPayload);

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
    const sourceExplanationMap: Record<string, string> = {
      new: "First time seeing this word → will count toward NIEUW",
      learning:
        "Still learning (interval < 1 day) → counts toward HERHALING when reviewed",
      review:
        "Graduated card due for review → counts toward HERHALING when reviewed",
      practice: "Practice mode (no card due) → no counter change",
    };
    const sourceKey =
      typeof stats.source === "string" ? stats.source : "unknown";
    const sourceExplanation = sourceExplanationMap[sourceKey] || "Unknown source";

    trainingDebug.groupCollapsed(
      `%c 📚 Word Selection: ${item.headword}${meaningLabel} (${stats.source || "unknown"})`,
      "color: #10b981; font-weight: bold;",
    );
    trainingDebug.log(
      `%c Source:`,
      "font-weight: bold",
      stats.source || "unknown",
      `- ${sourceExplanation}`,
    );
    trainingDebug.log(
      `%c Mode:`,
      "font-weight: bold",
      item.mode || stats.mode || "unknown",
    );
    trainingDebug.log(`%c Queue Turn:`, "font-weight: bold", queueTurn);
    trainingDebug.log(
      `%c New Cards Today:`,
      "font-weight: bold",
      `${stats.new_today ?? "?"}/${stats.daily_new_limit ?? "?"} (${stats.new_pool_size ?? "?"} unseen words available)`,
    );
    trainingDebug.log(
      `%c Learning Due:`,
      "font-weight: bold",
      `${stats.learning_due_count ?? "?"} cards in learning phase ready for review`,
    );
    trainingDebug.log(
      `%c Review Pool:`,
      "font-weight: bold",
      `${stats.review_pool_size ?? "?"} graduated cards in rotation`,
    );
    if (stats.interval != null) {
      trainingDebug.log(
        `%c Current Interval:`,
        "font-weight: bold",
        formatInterval(stats.interval),
        `(${stats.interval >= 1 ? "graduated" : "in learning"})`,
      );
      trainingDebug.log(
        `%c Stability:`,
        "font-weight: bold",
        stats.stability ?? "n/a",
      );
      trainingDebug.log(
        `%c Next Review:`,
        "font-weight: bold",
        stats.next_review ?? "n/a",
      );
    } else {
      trainingDebug.log(
        `%c Status:`,
        "font-weight: bold",
        "Brand new card - no previous review data",
      );
    }
    trainingDebug.log("Full Entry:", item);
    trainingDebug.groupEnd();

    return mapSelectionItem(item, rawData);
  }

  return null;
};
