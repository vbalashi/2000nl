import { supabase } from "../supabaseClient";
import { trainingDebug } from "../trainingDebug";
import type {
  CardFilter,
  QueueTurn,
  ScenarioStats,
  TrainingFocusFilter,
  TrainingFilterSource,
  TrainingMode,
  TrainingScenario,
  TrainingSessionSize,
  TrainingSessionPlan,
  TrainingWord,
  WordListType,
} from "../types";
import {
  isCrossReferenceOnly,
  mapScenario,
  normalizeRaw,
} from "./wordMappers";
import { normalizeTrainingSelectionFailure } from "./trainingSelectionFailure";

const MAX_CROSS_REFERENCE_SKIPS = 5;
const DEFAULT_SCENARIO_MODES: TrainingMode[] = ["word-to-definition"];
const SUPPORTED_CARD_MODES = new Set<TrainingMode>([
  "word-to-definition",
  "definition-to-word",
  "listen-recognize",
]);

export type TrainingScenarioCatalog = {
  fetch: () => Promise<TrainingScenario[]>;
  invalidate: () => void;
  resolveModes: (scenarioId: string) => Promise<TrainingMode[] | null>;
};

export type TrainingSessionPlanScope = {
  listId?: string | null;
  listType?: WordListType;
  cardFilter: CardFilter;
  trainingFilter?: TrainingFocusFilter | null;
  sessionSize?: TrainingSessionSize;
};

export type TrainingSession = TrainingSessionPlan & {
  sessionId: string;
};

export type TrainingSessionSnapshotMember = {
  ordinal: number;
  entryId: string;
  cardTypeId: string;
  queueSource: string;
  consumedAt: string | null;
  unavailableAt: string | null;
  unavailableReason?: TrainingSessionUnavailableReason | null;
};

export type TrainingSessionUnavailableReason =
  | "dictionary-access-revoked"
  | "projection-missing"
  | "entry-not-found"
  | "model-invalid"
  | "direct-example-missing"
  | "reverse-definition-missing";

export type TrainingSessionUnavailableResult = {
  status:
    | "unavailable"
    | "unavailable-complete"
    | "unavailable-replaced"
    | "unavailable-exhausted"
    | "consumed"
    | "not-member"
    | "out-of-order";
  ordinal?: number;
  reason?: TrainingSessionUnavailableReason;
  remaining?: number;
};

export type TrainingSessionUnavailableDiagnostic = {
  trainingSessionUnavailable: true;
  trainingSessionId: string;
  trainingSessionOrdinal: number;
  entryId: string;
  cardTypeId: TrainingMode;
  reason: TrainingSessionUnavailableReason;
};

export class TrainingSessionMemberUnavailableError extends Error {
  readonly diagnostic: TrainingSessionUnavailableDiagnostic;

  constructor(diagnostic: TrainingSessionUnavailableDiagnostic) {
    super(
      `training_session_member_unavailable:${diagnostic.entryId}:${diagnostic.cardTypeId}:${diagnostic.reason}`,
    );
    this.name = "TrainingSessionMemberUnavailableError";
    this.diagnostic = diagnostic;
  }
}

export const isTrainingSessionUnavailableError = (
  value: unknown,
): value is TrainingSessionMemberUnavailableError =>
  value instanceof TrainingSessionMemberUnavailableError ||
  (value instanceof Error &&
    value.name === "TrainingSessionMemberUnavailableError" &&
    Boolean((value as Partial<TrainingSessionMemberUnavailableError>).diagnostic));

const isTrainingSessionUnavailableDiagnostic = (
  value: unknown,
): value is TrainingSessionUnavailableDiagnostic => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.trainingSessionUnavailable === true &&
    typeof candidate.trainingSessionId === "string" &&
    typeof candidate.trainingSessionOrdinal === "number" &&
    Number.isInteger(candidate.trainingSessionOrdinal) &&
    candidate.trainingSessionOrdinal > 0 &&
    typeof candidate.entryId === "string" &&
    typeof candidate.cardTypeId === "string" &&
    SUPPORTED_CARD_MODES.has(candidate.cardTypeId as TrainingMode) &&
    isTrainingSessionUnavailableReason(candidate.reason)
  );
};

export type TrainingSessionSnapshot = TrainingSession & {
  sessionSize: TrainingSessionSize;
  /** Authoritative server count of accepted session actions. */
  completedActions?: number;
  completionReason?: "completed" | "exhausted" | null;
  members: TrainingSessionSnapshotMember[];
};

export const DEFAULT_TRAINING_SESSION_SIZE: TrainingSessionSize = 10;

export const isTrainingFocusFilterActive = (
  filter?: TrainingFocusFilter | null,
): filter is TrainingFocusFilter => {
  if (!filter) return false;
  return filter.dateWindow !== "all" ||
    Boolean(filter.sourceId) ||
    Boolean(filter.sourceKind) ||
    Boolean(filter.externalId);
};

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const mapTrainingSessionPlan = (value: unknown): TrainingSessionPlan | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    !isNonNegativeInteger(candidate.plannedNew) ||
    !isNonNegativeInteger(candidate.plannedReview) ||
    !isNonNegativeInteger(candidate.plannedPractice) ||
    !isNonNegativeInteger(candidate.plannedTotal) ||
    candidate.plannedTotal !==
      candidate.plannedNew + candidate.plannedReview + candidate.plannedPractice ||
    typeof candidate.plannedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.plannedAt))
  ) {
    return null;
  }
  if (
    candidate.requestedTotal !== undefined &&
    !isNonNegativeInteger(candidate.requestedTotal)
  ) return null;
  return {
    ...(candidate.requestedTotal !== undefined
      ? { requestedTotal: candidate.requestedTotal }
      : {}),
    plannedNew: candidate.plannedNew,
    plannedReview: candidate.plannedReview,
    plannedPractice: candidate.plannedPractice,
    plannedTotal: candidate.plannedTotal,
    plannedAt: candidate.plannedAt,
  };
};

const mapTrainingSession = (value: unknown): TrainingSession | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.sessionId !== "string" || !candidate.sessionId) {
    return null;
  }
  const plan = mapTrainingSessionPlan(candidate);
  return plan ? { sessionId: candidate.sessionId, ...plan } : null;
};

const mapTrainingSessionSnapshot = (
  value: unknown,
): TrainingSessionSnapshot | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const session = mapTrainingSession(candidate);
  const sessionSize =
    candidate.sessionSize === "all-due-today"
      ? "all-due-today"
      : typeof candidate.sessionSize === "number" &&
          Number.isInteger(candidate.sessionSize) &&
          candidate.sessionSize > 0
        ? candidate.sessionSize
        : typeof candidate.sessionSize === "string" &&
            /^[1-9][0-9]*$/.test(candidate.sessionSize)
          ? Number(candidate.sessionSize)
          : null;
  if (
    !session ||
    sessionSize === null ||
    !Array.isArray(candidate.members) ||
    (candidate.completedActions !== undefined &&
      !isNonNegativeInteger(candidate.completedActions)) ||
    (candidate.completionReason !== undefined &&
      candidate.completionReason !== null &&
      candidate.completionReason !== "completed" &&
      candidate.completionReason !== "exhausted")
  ) {
    return null;
  }
  const members = candidate.members.flatMap((member): TrainingSessionSnapshotMember[] => {
    if (!member || typeof member !== "object" || Array.isArray(member)) return [];
    const item = member as Record<string, unknown>;
    if (
      typeof item.ordinal !== "number" ||
      !Number.isInteger(item.ordinal) ||
      item.ordinal < 1 ||
      typeof item.entryId !== "string" ||
      typeof item.cardTypeId !== "string" ||
      typeof item.queueSource !== "string" ||
      (item.consumedAt !== null && typeof item.consumedAt !== "string") ||
      (item.unavailableAt !== null && typeof item.unavailableAt !== "string") ||
      (item.unavailableReason !== undefined &&
        item.unavailableReason !== null &&
        !isTrainingSessionUnavailableReason(item.unavailableReason))
    ) {
      return [];
    }
    return [{
      ordinal: item.ordinal,
      entryId: item.entryId,
      cardTypeId: item.cardTypeId,
      queueSource: item.queueSource,
      consumedAt: item.consumedAt as string | null,
      unavailableAt: item.unavailableAt as string | null,
      ...(item.unavailableReason !== undefined
        ? {
            unavailableReason:
              item.unavailableReason as TrainingSessionUnavailableReason | null,
          }
        : {}),
    }];
  });
  if (members.length !== candidate.members.length) return null;
  return {
    ...session,
    sessionSize,
    ...(candidate.completedActions !== undefined
      ? { completedActions: candidate.completedActions as number }
      : {}),
    ...(candidate.completionReason !== undefined
      ? { completionReason: candidate.completionReason as "completed" | "exhausted" | null }
      : {}),
    members,
  };
};

const isTrainingSessionUnavailableReason = (
  value: unknown,
): value is TrainingSessionUnavailableReason =>
  value === "dictionary-access-revoked" ||
  value === "projection-missing" ||
  value === "entry-not-found" ||
  value === "model-invalid" ||
  value === "direct-example-missing" ||
  value === "reverse-definition-missing";

const trainingSessionPlanScopePayload = (
  userId: string,
  modes: TrainingMode[],
  input: TrainingSessionPlanScope,
) => {
  const uniqueModes = [...new Set(modes)].sort();
  // A session freezes the learner's current IANA timezone even without a
  // date/source focus filter.  Sequential ordinary-meaning introduction uses
  // that persisted preference to calculate the next local calendar day.
  const trainingFilter = input.trainingFilter
    ? normalizeTrainingFocusFilter(input.trainingFilter)
    : {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    };
  return {
    p_user_id: userId,
    p_card_type_ids:
      uniqueModes.length > 0 ? uniqueModes : ["word-to-definition"],
    p_list_id: input.listId ?? null,
    p_list_type: input.listId ? input.listType ?? "curated" : "curated",
    p_card_filter: input.cardFilter,
    p_session_size: input.sessionSize ?? DEFAULT_TRAINING_SESSION_SIZE,
    p_training_filter: trainingFilter,
  };
};

/** Stable identity for the exact server plan scope latched by the UI session. */
export const createTrainingSessionPlanKey = (
  userId: string,
  modes: TrainingMode[],
  input: TrainingSessionPlanScope,
) => JSON.stringify(trainingSessionPlanScopePayload(userId, modes, input));

export async function fetchTrainingSessionPlan(
  userId: string,
  modes: TrainingMode[],
  input: TrainingSessionPlanScope,
): Promise<TrainingSessionPlan | null> {
  const scope = trainingSessionPlanScopePayload(userId, modes, input);
  const payload: Record<string, unknown> = {
    p_user_id: scope.p_user_id,
    p_card_type_ids: scope.p_card_type_ids,
    p_list_id: scope.p_list_id,
    p_list_type: scope.p_list_type,
    p_card_filter: scope.p_card_filter,
    p_session_size: scope.p_session_size,
    p_training_filter: scope.p_training_filter,
  };

  const { data, error } = await supabase.rpc(
    "get_training_session_plan",
    payload,
  );
  if (error) {
    console.error("Error planning training session:", error);
    return null;
  }
  return mapTrainingSessionPlan(data);
}

export async function startTrainingSession(
  userId: string,
  modes: TrainingMode[],
  input: TrainingSessionPlanScope,
): Promise<TrainingSession | null> {
  const scope = trainingSessionPlanScopePayload(userId, modes, input);
  const { data, error } = await supabase.rpc("start_training_session", {
    p_user_id: scope.p_user_id,
    p_card_type_ids: scope.p_card_type_ids,
    p_list_id: scope.p_list_id,
    p_list_type: scope.p_list_type,
    p_card_filter: scope.p_card_filter,
    p_training_filter: scope.p_training_filter,
    p_session_size: String(scope.p_session_size),
  });
  if (error) {
    console.error("Error starting training session:", error);
    return null;
  }
  return mapTrainingSession(data);
}

export async function fetchTrainingSessionSnapshot(
  userId: string,
  sessionId: string,
): Promise<TrainingSessionSnapshot | null> {
  const { data, error } = await supabase.rpc("get_training_session_snapshot", {
    p_user_id: userId,
    p_session_id: sessionId,
  });
  if (error) {
    console.error("Error fetching training session snapshot:", error);
    throw error;
  }
  return mapTrainingSessionSnapshot(data);
}

export async function markTrainingSessionMemberUnavailable(
  userId: string,
  sessionId: string,
  entryId: string,
  cardTypeId: TrainingMode,
  reason: TrainingSessionUnavailableReason,
): Promise<TrainingSessionUnavailableResult> {
  const { data, error } = await supabase.rpc(
    "mark_training_session_member_unavailable",
    {
      p_user_id: userId,
      p_session_id: sessionId,
      p_entry_id: entryId,
      p_card_type_id: cardTypeId,
      p_reason: reason,
    },
  );
  if (error) {
    console.error("Error marking training session member unavailable:", error);
    throw error;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("invalid_training_session_unavailable_response");
  }
  const result = data as Record<string, unknown>;
  const status = result.status;
  if (
    status !== "unavailable" &&
    status !== "unavailable-complete" &&
    status !== "unavailable-replaced" &&
    status !== "unavailable-exhausted" &&
    status !== "consumed" &&
    status !== "not-member" &&
    status !== "out-of-order"
  ) {
    throw new Error("invalid_training_session_unavailable_response");
  }
  return {
    status,
    ...(typeof result.ordinal === "number" ? { ordinal: result.ordinal } : {}),
    ...(isTrainingSessionUnavailableReason(result.reason)
      ? { reason: result.reason }
      : {}),
    ...(typeof result.remaining === "number" ? { remaining: result.remaining } : {}),
  };
}

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
  trainingFilter?: TrainingFocusFilter | null,
  allowPractice = false,
  trainingSessionId?: string,
): Promise<TrainingWord | null> => {
  if (trainingSessionId) {
    const { data, error } = await supabase.rpc(
      "get_next_training_session_card",
      {
        p_user_id: userId,
        p_session_id: trainingSessionId,
        p_exclude_card_keys: excludeCardKeys,
      },
    );
    if (error) {
      console.error("Error fetching next session card via RPC", error);
      throw normalizeTrainingSelectionFailure(error);
    }
    const item = Array.isArray(data) ? data[0] : data;
    if (!item) return null;
    if (isTrainingSessionUnavailableDiagnostic(item)) {
      throw new TrainingSessionMemberUnavailableError(item);
    }
    const rawData = normalizeRaw(item.raw);
    if (isCrossReferenceOnly(rawData)) return null;
    return mapSelectionItem(item, rawData);
  }

  const rpcPayload: Record<string, any> = {
    p_user_id: userId,
    p_card_type_ids: modes,
    p_exclude_entry_ids: excludeWordIds,
    p_exclude_card_keys: excludeCardKeys,
    p_list_id: listScope?.listId ?? null,
    p_list_type: listScope?.listType ?? "curated",
    p_card_filter: cardFilter,
    p_queue_turn: queueTurn,
    p_allow_practice: allowPractice,
  };

  if (isTrainingFocusFilterActive(trainingFilter)) {
    rpcPayload.p_training_filter = normalizeTrainingFocusFilter(trainingFilter);
  }

  const excludedIds = new Set(excludeWordIds);
  const excludedCardKeys = new Set(excludeCardKeys);
  const rpcName = isTrainingFocusFilterActive(trainingFilter)
    ? "get_next_filtered_card"
    : "get_next_card";

  for (let attempt = 0; attempt < MAX_CROSS_REFERENCE_SKIPS; attempt += 1) {
    rpcPayload.p_exclude_entry_ids = Array.from(excludedIds);
    rpcPayload.p_exclude_card_keys = Array.from(excludedCardKeys);

    let response;
    try {
      response = await supabase.rpc(rpcName, rpcPayload);
    } catch (cause) {
      throw normalizeTrainingSelectionFailure(cause);
    }
    const { data, error } = response;

    if (error) {
      console.error("Error fetching next word via RPC", error);
      throw normalizeTrainingSelectionFailure(error);
    }
    if (!data || data.length === 0) {
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

const resolveScenarioModesFrom = async (
  fetchScenarios: () => Promise<TrainingScenario[]>,
  scenarioId: string,
): Promise<TrainingMode[] | null> => {
  const scenarios = await fetchScenarios();
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

const resolveScenarioModes = (scenarioId: string) =>
  resolveScenarioModesFrom(fetchTrainingScenarios, scenarioId);

export const createTrainingScenarioCatalog = (): TrainingScenarioCatalog => {
  let request: Promise<TrainingScenario[]> | null = null;

  const fetch = () => {
    if (request) return request;
    const currentRequest = fetchTrainingScenarios();
    request = currentRequest;
    void currentRequest.then(
      (scenarios) => {
        if (scenarios.length === 0 && request === currentRequest) request = null;
      },
      () => undefined,
    );
    void currentRequest.catch(() => {
      if (request === currentRequest) request = null;
    });
    return currentRequest;
  };

  const invalidate = () => {
    request = null;
  };

  return {
    fetch,
    invalidate,
    resolveModes: async (scenarioId) => {
      const modes = await resolveScenarioModesFrom(fetch, scenarioId);
      if (!modes) invalidate();
      return modes;
    },
  };
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
  trainingFilter?: TrainingFocusFilter | null,
  resolveModes: (scenarioId: string) => Promise<TrainingMode[] | null> =
    resolveScenarioModes,
  allowPractice = false,
  trainingSessionId?: string,
): Promise<TrainingWord | null> => {
  const modes = modeOverride ?? (await resolveModes(scenarioId));
  if (!modes) return null;
  if (modes.length === 0) return null;

  if (trainingSessionId) {
    return fetchNextTrainingWord(
      userId,
      modes,
      excludeWordIds,
      listScope,
      cardFilter,
      queueTurn,
      excludeCardKeys,
      trainingFilter,
      allowPractice,
      trainingSessionId,
    );
  }

  const rpcPayload: Record<string, any> = {
    p_user_id: userId,
    p_card_type_ids: modes,
    p_exclude_entry_ids: excludeWordIds,
    p_exclude_card_keys: excludeCardKeys,
    p_list_id: listScope?.listId ?? null,
    p_list_type: listScope?.listType ?? "curated",
    p_card_filter: cardFilter,
    p_queue_turn: queueTurn,
    p_allow_practice: allowPractice,
  };

  if (isTrainingFocusFilterActive(trainingFilter)) {
    rpcPayload.p_training_filter = normalizeTrainingFocusFilter(trainingFilter);
  }

  const excludedIds = new Set(excludeWordIds);
  const excludedCardKeys = new Set(excludeCardKeys);
  const rpcName = isTrainingFocusFilterActive(trainingFilter)
    ? "get_next_filtered_card"
    : "get_next_card";

  for (let attempt = 0; attempt < MAX_CROSS_REFERENCE_SKIPS; attempt += 1) {
    rpcPayload.p_exclude_entry_ids = Array.from(excludedIds);
    rpcPayload.p_exclude_card_keys = Array.from(excludedCardKeys);

    let response;
    try {
      response = await supabase.rpc(rpcName, rpcPayload);
    } catch (cause) {
      throw normalizeTrainingSelectionFailure(cause);
    }
    const { data, error } = response;

    if (error) {
      console.error("Error fetching next word via scenario RPC:", error);
      throw normalizeTrainingSelectionFailure(error);
    }
    if (!data || data.length === 0) {
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

function normalizeTrainingFocusFilter(filter: TrainingFocusFilter) {
  return {
    dateWindow: filter.dateWindow,
    ...(filter.daysAgo !== undefined ? { daysAgo: filter.daysAgo } : {}),
    timezone: filter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    ...(filter.sourceKind ? { sourceKind: filter.sourceKind } : {}),
    ...(filter.sourceId ? { sourceId: filter.sourceId } : {}),
    ...(filter.externalId ? { externalId: filter.externalId } : {}),
  };
}

export async function fetchTrainingFilterSources(
  userId: string,
): Promise<TrainingFilterSource[]> {
  const { data, error } = await supabase.rpc("get_training_filter_sources", {
    p_user_id: userId,
    p_limit: 50,
  });

  if (error || !data) {
    if (error) console.error("Error fetching training filter sources", error);
    return [];
  }

  return (Array.isArray(data) ? data : [data]).map((item: any) => ({
    sourceId: String(item.sourceId || item.source_id || ""),
    kind: String(item.kind || "unknown"),
    provider: item.provider ?? null,
    externalId: item.externalId ?? item.external_id ?? null,
    title: item.title ?? null,
    label: String(item.label || item.title || item.externalId || item.kind || "Source"),
    eventCount: Number(item.eventCount ?? item.event_count ?? 0),
    lastSeenAt: item.lastSeenAt ?? item.last_seen_at ?? null,
  })).filter((item) => item.sourceId);
}
