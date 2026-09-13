import type {
  PlatformIdiomExerciseActionResponseV2,
  PlatformActionV2Request,
  PlatformOrdinaryActionId,
  PlatformActionV2Response,
  PlatformSenseCardStateV2,
  PlatformTrainingExerciseStateV2,
} from "../../../../packages/shared/types/platformV2";
import type {
  AuthenticatedSupabase,
  ServiceSupabase,
} from "./serverSupabase";
import { platformV2IdiomExercisesEnabled } from "./platformV2Rollout";

export type PlatformV2ActionOperationResult = {
  payload: unknown;
  status: number;
  receiptStatus?: "accepted" | "duplicate";
};

export type PlatformV2ActionCallPath =
  | "training"
  | "library"
  | "legacy_first_party"
  | "connected_client";

export async function performPlatformV2Action(
  auth: AuthenticatedSupabase,
  service: ServiceSupabase,
  request: PlatformActionV2Request,
  callPath: PlatformV2ActionCallPath,
): Promise<PlatformV2ActionOperationResult> {
  if (request.actionId === "review-exercise") {
    if (callPath !== "training") {
      return {
        payload: { error: "training_exercise_actions_training_only" },
        status: 403,
      };
    }
    if (!platformV2IdiomExercisesEnabled()) {
      return {
        payload: { error: "platform_v2_idiom_exercises_not_enabled" },
        status: 503,
      };
    }
    return performPlatformV2IdiomExerciseAction(auth, service, request);
  }
  if (callPath === "training" && !request.trainingSessionId) {
    return {
      payload: { error: "missing_training_session_id" },
      status: 400,
    };
  }
  if (callPath === "library" && request.trainingSessionId) {
    return {
      payload: { error: "unexpected_training_session_id" },
      status: 400,
    };
  }
  if (callPath === "legacy_first_party" && request.trainingSessionId) {
    return {
      payload: { error: "unexpected_training_session_id" },
      status: 400,
    };
  }
  if (
    (callPath === "connected_client") !==
    (auth.principal.authKind === "connected_client")
  ) {
    return { payload: { error: "invalid_action_call_path" }, status: 403 };
  }

  const undoTarget =
    request.actionId === "undo-known" ? request.target : null;
  const reviewResult =
    request.actionId === "review-card" ? request.reviewResult : null;
  const actionPayload = {
    p_user_id: auth.user.id,
    p_action_id: request.actionId,
    p_entry_id: request.target.entryId,
    p_card_type_id: request.target.cardTypeId,
    p_state_revision: request.target.stateRevision,
    p_active_known_mark_id: undoTarget?.activeKnownMarkId ?? null,
    p_known_mark_revision: undoTarget?.knownMarkRevision ?? null,
    p_review_result: reviewResult,
    p_client_event_id: request.clientEventId,
    p_source_context: request.sourceContext ?? null,
    p_auth_kind: auth.principal.authKind,
    p_connected_client_id: auth.principal.connectedClientId,
    ...(callPath === "training"
      ? { p_training_session_id: request.trainingSessionId }
      : callPath === "library"
        ? { p_training_session_id: null }
        : {}),
  };
  const { data, error } = await service.supabase.rpc(
    "perform_platform_v2_card_action_as_principal",
    actionPayload,
  );

  if (error) return actionError(error);
  const result = asRecord(data);
  const card = platformCardState(result.card, request.target.cardTypeId);
  if (
    (result.status !== "accepted" && result.status !== "duplicate") ||
    result.actionId !== request.actionId ||
    result.clientEventId !== request.clientEventId ||
    !card
  ) {
    return {
      payload: { error: "invalid_platform_v2_action_response" },
      status: 500,
    };
  }

  const payload: PlatformActionV2Response = {
    contractVersion: "platform-action-v2",
    actionId: request.actionId,
    clientEventId: request.clientEventId,
    accepted: true,
    card,
  };
  return {
    payload,
    status: 200,
    receiptStatus: result.status as "accepted" | "duplicate",
  };
}

async function performPlatformV2IdiomExerciseAction(
  auth: AuthenticatedSupabase,
  service: ServiceSupabase,
  request: Extract<PlatformActionV2Request, { actionId: "review-exercise" }>,
): Promise<PlatformV2ActionOperationResult> {
  const { data, error } = await service.supabase.rpc(
    "perform_platform_v2_idiom_exercise_action_as_principal_v1",
    {
      p_user_id: auth.user.id,
      p_target_id: request.target.targetId,
      p_state_revision: request.target.stateRevision,
      p_review_result: request.reviewResult,
      p_client_event_id: request.clientEventId,
      p_direction: request.target.direction,
      p_training_session_id: request.trainingSessionId,
      p_source_context: request.sourceContext ?? null,
    },
  );
  if (error) return idiomExerciseActionError(error);

  const result = asRecord(data);
  const state = platformTrainingExerciseState(result.state);
  if (
    (result.status !== "accepted" && result.status !== "duplicate") ||
    result.actionId !== "review-exercise" ||
    result.clientEventId !== request.clientEventId ||
    result.family !== "idiom" ||
    result.targetId !== request.target.targetId ||
    result.direction !== request.target.direction ||
    !state ||
    typeof result.targetKey !== "string" ||
    !result.targetKey
  ) {
    return {
      payload: { error: "invalid_platform_v2_exercise_action_response" },
      status: 500,
    };
  }

  const payload: PlatformIdiomExerciseActionResponseV2 = {
    contractVersion: "platform-action-v2",
    actionId: "review-exercise",
    clientEventId: request.clientEventId,
    accepted: true,
    exercise: {
      targetId: request.target.targetId,
      targetKey: result.targetKey,
      family: "idiom",
      direction: request.target.direction,
      state,
    },
  };
  return {
    payload,
    status: 200,
    receiptStatus: result.status as "accepted" | "duplicate",
  };
}

export async function reconcilePlatformV2ActionReceipt(
  auth: AuthenticatedSupabase,
  service: ServiceSupabase,
  clientEventId: string,
): Promise<PlatformV2ActionOperationResult> {
  const { data, error } = await service.supabase.rpc(
    "reconcile_platform_v2_action_receipt_as_principal",
    {
      p_user_id: auth.user.id,
      p_client_event_id: clientEventId,
    },
  );
  if (error) return actionError(error);
  if (data === null) {
    return {
      payload: { error: "action_receipt_not_found" },
      status: 404,
    };
  }

  const result = asRecord(data);
  const actionId = platformActionId(result.actionId);
  const cardTypeId = asString(asRecord(result.card).cardTypeId);
  const card = cardTypeId ? platformCardState(result.card, cardTypeId) : null;
  if (
    !actionId ||
    result.clientEventId !== clientEventId ||
    !card
  ) {
    return {
      payload: { error: "invalid_platform_v2_action_receipt" },
      status: 500,
    };
  }

  const payload: PlatformActionV2Response = {
    contractVersion: "platform-action-v2",
    actionId,
    clientEventId,
    accepted: true,
    card,
  };
  return { payload, status: 200, receiptStatus: "duplicate" };
}

export async function reconcilePlatformV2IdiomExerciseActionReceipt(
  auth: AuthenticatedSupabase,
  service: ServiceSupabase,
  clientEventId: string,
): Promise<PlatformV2ActionOperationResult> {
  const { data, error } = await service.supabase.rpc(
    "reconcile_platform_v2_idiom_receipt_as_principal",
    {
      p_user_id: auth.user.id,
      p_client_event_id: clientEventId,
    },
  );
  if (error) return idiomExerciseActionError(error);
  if (data === null) {
    return { payload: { error: "action_receipt_not_found" }, status: 404 };
  }

  const result = asRecord(data);
  const state = platformTrainingExerciseState(result.state);
  if (
    result.status !== "duplicate" ||
    result.actionId !== "review-exercise" ||
    result.clientEventId !== clientEventId ||
    result.family !== "idiom" ||
    typeof result.targetId !== "string" ||
    typeof result.targetKey !== "string" ||
    (result.direction !== "direct" && result.direction !== "reverse") ||
    !state
  ) {
    return {
      payload: { error: "invalid_platform_v2_exercise_action_receipt" },
      status: 500,
    };
  }

  const payload: PlatformIdiomExerciseActionResponseV2 = {
    contractVersion: "platform-action-v2",
    actionId: "review-exercise",
    clientEventId,
    accepted: true,
    exercise: {
      targetId: result.targetId,
      targetKey: result.targetKey,
      family: "idiom",
      direction: result.direction,
      state,
    },
  };
  return { payload, status: 200, receiptStatus: "duplicate" };
}

function platformActionId(
  value: unknown,
): PlatformOrdinaryActionId | null {
  return value === "start-learning" ||
    value === "mark-known" ||
    value === "undo-known" ||
    value === "review-card"
    ? value
    : null;
}

function actionError(error: unknown): PlatformV2ActionOperationResult {
  const message = errorMessage(error);
  if (message.includes("training_session_superseded")) {
    return { payload: { error: "training_session_superseded" }, status: 409 };
  }
  if (message.includes("platform_action_idempotency_conflict")) {
    return { payload: { error: "idempotency_conflict" }, status: 409 };
  }
  if (message.includes("platform_card_state_conflict")) {
    return { payload: { error: "state_conflict" }, status: 409 };
  }
  if (message.includes("platform_known_mark_conflict")) {
    return { payload: { error: "known_mark_conflict" }, status: 409 };
  }
  if (message.includes("platform_card_already_known")) {
    return { payload: { error: "card_already_known" }, status: 409 };
  }
  if (message.includes("platform_action_not_available")) {
    return { payload: { error: "action_not_available" }, status: 409 };
  }
  if (message.includes("card_is_known")) {
    return { payload: { error: "card_is_known" }, status: 409 };
  }
  if (message.includes("entry_not_found")) {
    return { payload: { error: "entry_not_found" }, status: 404 };
  }
  if (message.includes("entry_not_accessible")) {
    return { payload: { error: "entry_not_accessible" }, status: 403 };
  }
  if (message.includes("invalid_connected_client_grant")) {
    return {
      payload: { error: "invalid_connected_client_grant" },
      status: 403,
    };
  }
  return {
    payload: { error: "platform_v2_action_failed" },
    status: 500,
  };
}

function idiomExerciseActionError(error: unknown): PlatformV2ActionOperationResult {
  const message = errorMessage(error);
  if (
    message.includes("training_session_superseded") ||
    message.includes("training_exercise_session_") ||
    message.includes("training_exercise_target_unavailable") ||
    message.includes("training_exercise_source_not_eligible")
  ) {
    return { payload: { error: "training_exercise_not_available" }, status: 409 };
  }
  if (message.includes("training_exercise_state_conflict")) {
    return { payload: { error: "state_conflict" }, status: 409 };
  }
  if (message.includes("training_exercise_action_idempotency_conflict")) {
    return { payload: { error: "idempotency_conflict" }, status: 409 };
  }
  return { payload: { error: "platform_v2_exercise_action_failed" }, status: 500 };
}

function platformCardState(
  value: unknown,
  expectedCardTypeId: string,
): PlatformSenseCardStateV2 | null {
  const card = asRecord(value);
  const scheduler = asRecord(card.scheduler);
  const phase = scheduler.phase;
  const stateRevision = asString(card.stateRevision);
  if (
    card.cardTypeId !== expectedCardTypeId ||
    !stateRevision ||
    (phase !== "not-started" &&
      phase !== "encountered" &&
      phase !== "learning" &&
      phase !== "reviewing" &&
      phase !== "hidden" &&
      phase !== "frozen")
  ) {
    return null;
  }

  const knownMark = platformKnownMark(card.knownMark);
  if (card.knownMark !== null && !knownMark) return null;

  return {
    cardTypeId: expectedCardTypeId as PlatformSenseCardStateV2["cardTypeId"],
    scheduler: {
      phase,
      ...(typeof scheduler.repeatCount === "number"
        ? { repeatCount: scheduler.repeatCount }
        : {}),
      ...(scheduler.lastSeenAt === null ||
      typeof scheduler.lastSeenAt === "string"
        ? { lastSeenAt: scheduler.lastSeenAt as string | null }
        : {}),
      ...(typeof scheduler.frozenUntil === "string"
        ? { frozenUntil: scheduler.frozenUntil }
        : {}),
    },
    knownMark,
    stateRevision,
  };
}

function platformKnownMark(
  value: unknown,
): PlatformSenseCardStateV2["knownMark"] {
  if (value === null) return null;
  const mark = asRecord(value);
  const markId = asString(mark.markId);
  const revision = asString(mark.revision);
  const markedAt = asString(mark.markedAt);
  return markId && revision && markedAt
    ? { markId, revision, markedAt }
    : null;
}

function platformTrainingExerciseState(
  value: unknown,
): PlatformTrainingExerciseStateV2 | null {
  const state = asRecord(value);
  const stateRevision = asString(state.stateRevision);
  const fsrsReps = state.fsrsReps;
  const fsrsLapses = state.fsrsLapses;
  const seenCount = state.seenCount;
  const successCount = state.successCount;
  if (
    !stateRevision ||
    typeof fsrsReps !== "number" ||
    !Number.isInteger(fsrsReps) ||
    fsrsReps < 0 ||
    typeof fsrsLapses !== "number" ||
    !Number.isInteger(fsrsLapses) ||
    fsrsLapses < 0 ||
    typeof seenCount !== "number" ||
    !Number.isInteger(seenCount) ||
    seenCount < 0 ||
    typeof successCount !== "number" ||
    !Number.isInteger(successCount) ||
    successCount < 0 ||
    typeof state.fsrsEnabled !== "boolean" ||
    typeof state.hidden !== "boolean" ||
    typeof state.inLearning !== "boolean"
  ) {
    return null;
  }
  const reviewResult = state.lastResult;
  if (
    reviewResult !== null &&
    reviewResult !== "fail" &&
    reviewResult !== "hard" &&
    reviewResult !== "success" &&
    reviewResult !== "easy"
  ) {
    return null;
  }
  return {
    stateRevision,
    fsrsStability: nullableFiniteNumber(state.fsrsStability),
    fsrsDifficulty: nullableFiniteNumber(state.fsrsDifficulty),
    fsrsReps,
    fsrsLapses,
    fsrsLastGrade: nullableFiniteNumber(state.fsrsLastGrade),
    fsrsLastInterval: nullableFiniteNumber(state.fsrsLastInterval),
    fsrsTargetRetention: nullableFiniteNumber(state.fsrsTargetRetention),
    fsrsParamsVersion: nullableString(state.fsrsParamsVersion),
    fsrsEnabled: state.fsrsEnabled,
    nextReviewAt: nullableString(state.nextReviewAt),
    lastSeenAt: nullableString(state.lastSeenAt),
    lastReviewedAt: nullableString(state.lastReviewedAt),
    seenCount,
    successCount,
    lastResult: reviewResult,
    hidden: state.hidden,
    frozenUntil: nullableString(state.frozenUntil),
    inLearning: state.inLearning,
    learningDueAt: nullableString(state.learningDueAt),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : typeof value === "string" && value.trim()
      ? value
      : null;
}

function nullableFiniteNumber(value: unknown): number | null {
  return value === null || value === undefined
    ? null
    : typeof value === "number" && Number.isFinite(value)
      ? value
      : null;
}

function errorMessage(value: unknown) {
  const record = asRecord(value);
  return typeof record.message === "string"
    ? record.message
    : String(value);
}
