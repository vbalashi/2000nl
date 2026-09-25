import { supabase } from "@/lib/supabaseClient";
import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";
import { platformFetchWithTimeout } from "./platformFetchWithTimeout";
import { measureTrainingTransitionStage } from "../training/trainingTransitionTiming";
import type {
  PlatformIdiomExerciseCandidateV2,
  PlatformIdiomExerciseCandidatesResponseV2,
  PlatformIdiomExerciseSessionNextV2,
  PlatformIdiomExerciseSessionV2,
  PlatformIdiomExerciseActionResponseV2,
  PlatformIdiomExerciseSessionMemberV2,
  PlatformTrainingExerciseDirectionV2,
  PlatformTrainingExerciseReviewResultV2,
  PlatformTrainingExerciseStateV2,
} from "../../../../packages/shared/types/platformV2";
import type { PlatformSourceContextV2 } from "../../../../packages/shared/types/platform";
import type { CardFilter, TrainingFocusFilter } from "@/lib/types";

export type PlatformV2IdiomExerciseCandidatesInput = {
  direction: PlatformTrainingExerciseDirectionV2;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
};

export async function fetchPlatformV2IdiomExerciseCandidates(
  input: PlatformV2IdiomExerciseCandidatesInput,
): Promise<PlatformIdiomExerciseCandidatesResponseV2> {
  const response = await platformFetchWithTimeout(
    "/api/platform/v2/training/idioms",
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: input.signal,
      headers: await platformV2AuthenticatedJsonHeaders(),
      body: JSON.stringify({
        direction: input.direction,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        ...(input.offset === undefined ? {} : { offset: input.offset }),
      }),
    },
  );
  const payload = await readJson(response);
  if (!response.ok) throw platformError(payload, "idiom_exercise_candidates_failed");
  const result = parseCandidates(payload, input.direction);
  if (!result) throw new Error("invalid_platform_v2_idiom_exercise_response");
  return result;
}

export type StartPlatformV2IdiomTrainingSessionInput = {
  userId: string;
  direction: PlatformTrainingExerciseDirectionV2;
  sessionSize: number;
  requestId: string;
  listId: string | null;
  listType: "curated" | "user";
  cardFilter: CardFilter;
  trainingFilter: TrainingFocusFilter;
  newReviewRatio: number;
};

export async function startPlatformV2IdiomTrainingSession(
  input: StartPlatformV2IdiomTrainingSessionInput,
): Promise<PlatformIdiomExerciseSessionV2> {
  const { data, error } = await measureTrainingTransitionStage(
    input.requestId,
    "idiom.session-start",
    async () =>
      await supabase.rpc("start_platform_v2_idiom_training_session", {
        p_user_id: input.userId,
        p_direction: input.direction,
        p_session_size: String(input.sessionSize),
        p_request_id: input.requestId,
        p_list_id: input.listId,
        p_list_type: input.listType,
        p_card_filter: input.cardFilter,
        p_training_filter: input.trainingFilter,
        p_new_review_ratio: input.newReviewRatio,
      }),
  );
  if (error) throw error;
  const session = parseSession(data);
  if (!session) throw new Error("invalid_platform_v2_idiom_session_response");
  return session;
}

export async function fetchPlatformV2IdiomTrainingSessionSnapshot(
  userId: string,
  sessionId: string,
): Promise<PlatformIdiomExerciseSessionV2 | null> {
  const { data, error } = await supabase.rpc(
    "read_platform_v2_idiom_training_session_snapshot",
    { p_user_id: userId, p_session_id: sessionId },
  );
  if (error) throw error;
  if (data === null) return null;
  const session = parseSession(data);
  if (!session) throw new Error("invalid_platform_v2_idiom_session_snapshot");
  return session;
}

export async function fetchNextPlatformV2IdiomTrainingSessionExercise(
  userId: string,
  sessionId: string,
): Promise<PlatformIdiomExerciseSessionNextV2> {
  const { data, error } = await supabase.rpc(
    "read_platform_v2_idiom_training_session_next",
    { p_user_id: userId, p_session_id: sessionId },
  );
  if (error) throw error;
  const next = parseNext(data);
  if (!next) throw new Error("invalid_platform_v2_idiom_session_next_response");
  return next;
}

export async function markPlatformV2IdiomTrainingSessionMemberUnavailable(
  userId: string,
  sessionId: string,
  targetId: string,
  reason:
    | "pair-excluded"
    | "projection-missing"
    | "dictionary-access-revoked"
    | "entry-not-found",
): Promise<{
  status:
    | "unavailable"
    | "unavailable-exhausted"
    | "consumed"
    | "not-member"
    | "out-of-order";
  ordinal?: number;
  reason?: string;
  remaining?: number;
}> {
  const { data, error } = await supabase.rpc(
    "mark_platform_v2_idiom_training_session_member_unavailable",
    {
      p_user_id: userId,
      p_session_id: sessionId,
      p_target_id: targetId,
      p_reason: reason,
    },
  );
  if (error) throw error;
  const result = asRecord(data);
  if (
    result.status !== "unavailable" &&
    result.status !== "unavailable-exhausted" &&
    result.status !== "consumed" &&
    result.status !== "not-member" &&
    result.status !== "out-of-order"
  ) {
    throw new Error("invalid_platform_v2_idiom_unavailable_response");
  }
  return {
    status: result.status,
    ...(integer(result.ordinal) ? { ordinal: result.ordinal } : {}),
    ...(typeof result.reason === "string" ? { reason: result.reason } : {}),
    ...(integer(result.remaining) ? { remaining: result.remaining } : {}),
  };
}

export async function performPlatformV2IdiomExerciseAction(input: {
  trainingSessionId: string;
  /** Reuse this identity when retrying the same intentional grade after an uncertain response. */
  clientEventId?: string;
  candidate: Pick<
    PlatformIdiomExerciseCandidateV2,
    "targetId" | "direction" | "targetKey" | "state"
  >;
  reviewResult: PlatformTrainingExerciseReviewResultV2;
  sourceContext?: PlatformSourceContextV2;
}): Promise<PlatformIdiomExerciseActionResponseV2> {
  const request = {
    actionId: "review-exercise" as const,
    clientEventId: input.clientEventId ?? crypto.randomUUID(),
    trainingSessionId: input.trainingSessionId,
    target: {
      kind: "training-exercise" as const,
      targetId: input.candidate.targetId,
      family: "idiom" as const,
      direction: input.candidate.direction,
      stateRevision: input.candidate.state?.stateRevision ?? "untracked",
    },
    reviewResult: input.reviewResult,
    ...(input.sourceContext ? { sourceContext: input.sourceContext } : {}),
  };
  const headers = await platformV2AuthenticatedJsonHeaders();
  let response: Response;
  try {
    response = await platformFetchWithTimeout("/api/platform/v2/actions", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...Object.fromEntries(new Headers(headers).entries()),
        "x-platform-action-attempt": "1",
      },
      body: JSON.stringify(request),
    });
  } catch (error) {
    if (!isAmbiguousTransportError(error)) throw error;
    response = await platformFetchWithTimeout(
      "/api/platform/v2/actions/reconcile",
      {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers,
        body: JSON.stringify({
          clientEventId: request.clientEventId,
          actionFamily: "idiom",
        }),
      },
    );
  }
  const payload = await readJson(response);
  if (!response.ok) throw platformError(payload, "idiom_exercise_action_failed");
  const result = parseActionResponse(payload, request.clientEventId);
  if (!result) throw new Error("invalid_platform_v2_idiom_action_response");
  return result;
}

function parseCandidates(
  value: unknown,
  direction: PlatformTrainingExerciseDirectionV2,
): PlatformIdiomExerciseCandidatesResponseV2 | null {
  const result = asRecord(value);
  if (
    result.contractVersion !== "platform-idiom-exercise-candidates-v2" ||
    result.family !== "idiom" ||
    result.direction !== direction ||
    !Array.isArray(result.items)
  ) return null;
  const items = result.items.map((item) => parseCandidate(item, direction));
  return items.every(Boolean)
    ? {
        contractVersion: "platform-idiom-exercise-candidates-v2",
        family: "idiom",
        direction,
        items: items as PlatformIdiomExerciseCandidateV2[],
      }
    : null;
}

function parseCandidate(
  value: unknown,
  direction: PlatformTrainingExerciseDirectionV2,
): PlatformIdiomExerciseCandidateV2 | null {
  const item = asRecord(value);
  if (
    !string(item.targetId) ||
    !string(item.targetKey) ||
    item.family !== "idiom" ||
    item.direction !== direction ||
    !string(item.entryId) ||
    !string(item.contentNodeId) ||
    !string(item.expressionSourcePath) ||
    !string(item.explanationSourcePath) ||
    !string(item.sourceRevision) ||
    !string(item.sourceTextFingerprint) ||
    !["new", "learning", "review"].includes(String(item.queueSource)) ||
    !Array.isArray(item.exampleSourcePaths) ||
    !item.exampleSourcePaths.every(string)
  ) return null;
  const state = item.state === null ? null : parseState(item.state);
  if (item.state !== null && !state) return null;
  return {
    targetId: item.targetId,
    targetKey: item.targetKey,
    family: "idiom",
    direction,
    entryId: item.entryId,
    contentNodeId: item.contentNodeId,
    expressionSourcePath: item.expressionSourcePath,
    explanationSourcePath: item.explanationSourcePath,
    exampleSourcePaths: item.exampleSourcePaths,
    sourceRevision: item.sourceRevision,
    sourceTextFingerprint: item.sourceTextFingerprint,
    queueSource: item.queueSource as "new" | "learning" | "review",
    state,
  };
}

function parseSession(value: unknown): PlatformIdiomExerciseSessionV2 | null {
  const item = asRecord(value);
  const direction = item.direction;
  if (
    item.contractVersion !== "platform-idiom-exercise-session-v2" ||
    !string(item.sessionId) ||
    item.exerciseFamily !== "idiom" ||
    (direction !== "direct" && direction !== "reverse") ||
    !string(item.sessionSize) ||
    !integer(item.requestedTotal) ||
    !integer(item.plannedNew) ||
    !integer(item.plannedReview) ||
    item.plannedPractice !== 0 ||
    !integer(item.plannedTotal) ||
    !string(item.plannedAt) ||
    (item.runStatus !== "active" && item.runStatus !== "superseded") ||
    (item.runStatus === "active" && !integerAtLeastOne(item.runGeneration)) ||
    (item.runStatus === "superseded" && item.runGeneration !== null) ||
    !integer(item.completedActions) ||
    (item.completionReason !== null &&
      item.completionReason !== "completed" &&
      item.completionReason !== "exhausted") ||
    !Array.isArray(item.members)
  ) return null;
  const members = item.members.map(parseMember);
  if (members.some((member) => member === null)) return null;
  return {
    contractVersion: "platform-idiom-exercise-session-v2",
    sessionId: item.sessionId,
    exerciseFamily: "idiom",
    direction,
    sessionSize: item.sessionSize,
    requestedTotal: item.requestedTotal,
    plannedNew: item.plannedNew,
    plannedReview: item.plannedReview,
    plannedPractice: 0,
    plannedTotal: item.plannedTotal,
    plannedAt: item.plannedAt,
    runStatus: item.runStatus,
    runGeneration: item.runGeneration as number | null,
    completedActions: item.completedActions,
    completionReason: item.completionReason,
    members: members as PlatformIdiomExerciseSessionMemberV2[],
  };
}

function parseMember(value: unknown): PlatformIdiomExerciseSessionMemberV2 | null {
  const item = asRecord(value);
  if (
    !integerAtLeastOne(item.ordinal) ||
    !string(item.targetId) ||
    !["new", "learning", "review"].includes(String(item.queueSource)) ||
    !isNullableString(item.consumedAt) ||
    !isNullableString(item.unavailableAt) ||
    (item.unavailableReason !== null && typeof item.unavailableReason !== "string") ||
    !string(item.entryId) ||
    !string(item.contentNodeId) ||
    item.family !== "idiom" ||
    (item.direction !== "direct" && item.direction !== "reverse")
  ) return null;
  return {
    ordinal: item.ordinal,
    targetId: item.targetId,
    queueSource: item.queueSource as "new" | "learning" | "review",
    consumedAt: item.consumedAt as string | null,
    unavailableAt: item.unavailableAt as string | null,
    unavailableReason: item.unavailableReason as string | null,
    entryId: item.entryId,
    contentNodeId: item.contentNodeId,
    family: "idiom",
    direction: item.direction,
  };
}

function parseNext(value: unknown): PlatformIdiomExerciseSessionNextV2 | null {
  const item = asRecord(value);
  if (item.status === "ready") {
    const candidate = parseCandidate(item, item.direction as PlatformTrainingExerciseDirectionV2);
    return candidate && string(item.sessionId) && integerAtLeastOne(item.ordinal)
      ? { ...candidate, status: "ready", sessionId: item.sessionId, ordinal: item.ordinal }
      : null;
  }
  if (
    item.status === "completed" ||
    item.status === "exhausted" ||
    item.status === "superseded" ||
    item.status === "not-member"
  ) {
    return {
      status: item.status,
      ...(string(item.sessionId) ? { sessionId: item.sessionId } : {}),
      ...(integer(item.completedActions) ? { completedActions: item.completedActions } : {}),
      ...(integer(item.requestedTotal) ? { requestedTotal: item.requestedTotal } : {}),
    };
  }
  if (
    item.status === "unavailable" &&
    string(item.sessionId) &&
    integerAtLeastOne(item.ordinal) &&
    string(item.targetId) &&
    (item.reason === "pair-excluded" ||
      item.reason === "projection-missing" ||
      item.reason === "dictionary-access-revoked") &&
    integer(item.remaining)
  ) {
    return {
      status: "unavailable",
      sessionId: item.sessionId,
      ordinal: item.ordinal,
      targetId: item.targetId,
      reason: item.reason,
      remaining: item.remaining,
    };
  }
  return null;
}

function parseActionResponse(
  value: unknown,
  clientEventId: string,
): PlatformIdiomExerciseActionResponseV2 | null {
  const item = asRecord(value);
  const exercise = asRecord(item.exercise);
  const state = parseState(exercise.state);
  if (
    item.contractVersion !== "platform-action-v2" ||
    item.actionId !== "review-exercise" ||
    item.clientEventId !== clientEventId ||
    item.accepted !== true ||
    !string(exercise.targetId) ||
    !string(exercise.targetKey) ||
    exercise.family !== "idiom" ||
    (exercise.direction !== "direct" && exercise.direction !== "reverse") ||
    !state
  ) return null;
  return {
    contractVersion: "platform-action-v2",
    actionId: "review-exercise",
    clientEventId,
    accepted: true,
    exercise: {
      targetId: exercise.targetId,
      targetKey: exercise.targetKey,
      family: "idiom",
      direction: exercise.direction,
      state,
    },
  };
}

function parseState(value: unknown): PlatformTrainingExerciseStateV2 | null {
  const item = asRecord(value);
  const lastResult = item.lastResult;
  if (
    !string(item.stateRevision) ||
    !integer(item.fsrsReps) ||
    !integer(item.fsrsLapses) ||
    !integer(item.seenCount) ||
    !integer(item.successCount) ||
    typeof item.fsrsEnabled !== "boolean" ||
    typeof item.hidden !== "boolean" ||
    typeof item.inLearning !== "boolean" ||
    (lastResult !== null &&
      lastResult !== "fail" &&
      lastResult !== "hard" &&
      lastResult !== "success" &&
      lastResult !== "easy")
  ) return null;
  return {
    stateRevision: item.stateRevision,
    fsrsStability: nullableNumber(item.fsrsStability),
    fsrsDifficulty: nullableNumber(item.fsrsDifficulty),
    fsrsReps: item.fsrsReps,
    fsrsLapses: item.fsrsLapses,
    fsrsLastGrade: nullableNumber(item.fsrsLastGrade),
    fsrsLastInterval: nullableNumber(item.fsrsLastInterval),
    fsrsTargetRetention: nullableNumber(item.fsrsTargetRetention),
    fsrsParamsVersion: nullableString(item.fsrsParamsVersion),
    fsrsEnabled: item.fsrsEnabled,
    nextReviewAt: nullableString(item.nextReviewAt),
    lastSeenAt: nullableString(item.lastSeenAt),
    lastReviewedAt: nullableString(item.lastReviewedAt),
    seenCount: item.seenCount,
    successCount: item.successCount,
    lastResult,
    hidden: item.hidden,
    frozenUntil: nullableString(item.frozenUntil),
    inLearning: item.inLearning,
    learningDueAt: nullableString(item.learningDueAt),
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function platformError(value: unknown, fallback: string): Error {
  const error = asRecord(value).error;
  return new Error(typeof error === "string" && error ? error : fallback);
}

function isAmbiguousTransportError(error: unknown) {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message === "Failed to fetch" || message === "platform_request_timeout";
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function string(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || string(value);
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : string(value)
      ? value
      : null;
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function integerAtLeastOne(value: unknown): value is number {
  return integer(value) && value > 0;
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined
    ? null
    : typeof value === "number" && Number.isFinite(value)
      ? value
      : null;
}
