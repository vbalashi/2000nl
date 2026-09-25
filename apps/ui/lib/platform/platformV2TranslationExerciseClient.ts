import { supabase } from "@/lib/supabaseClient";
import type {
  PlatformTranslationExerciseCandidateV2,
  PlatformTranslationExerciseSessionV2,
  PlatformTranslationExerciseSessionNextV2,
  PlatformTranslationExerciseActionResponseV2,
  PlatformTrainingExerciseReviewResultV2,
  PlatformTrainingExerciseStateV2,
} from "../../../../packages/shared/types/platformV2";
import type { CardFilter, TrainingFocusFilter } from "@/lib/types";
import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";
import { platformFetchWithTimeout } from "./platformFetchWithTimeout";

export async function startPlatformV2TranslationTrainingSession(input: {
  userId: string;
  sessionSize: number;
  requestId: string;
  listId: string | null;
  listType: "curated" | "user";
  cardFilter: CardFilter;
  trainingFilter: TrainingFocusFilter;
  newReviewRatio: number;
}): Promise<PlatformTranslationExerciseSessionV2> {
  const { data, error } = await supabase.rpc(
    "start_platform_v2_translation_training_session_scoped",
    {
      p_user_id: input.userId,
      p_session_size: String(input.sessionSize),
      p_request_id: input.requestId,
      p_list_id: input.listId,
      p_list_type: input.listType,
      p_card_filter: input.cardFilter,
      p_training_filter: input.trainingFilter,
      p_new_review_ratio: input.newReviewRatio,
    },
  );
  if (error) throw error;
  const session = parseSession(data);
  if (!session) throw new Error("invalid_platform_v2_translation_session");
  return session;
}

export async function fetchPlatformV2TranslationTrainingSessionSnapshot(
  userId: string,
  sessionId: string,
): Promise<PlatformTranslationExerciseSessionV2 | null> {
  const { data, error } = await supabase.rpc(
    "read_platform_v2_translation_training_session_snapshot",
    { p_user_id: userId, p_session_id: sessionId },
  );
  if (error) throw error;
  if (data === null) return null;
  const session = parseSession(data);
  if (!session) throw new Error("invalid_platform_v2_translation_session_snapshot");
  return session;
}

export async function fetchNextPlatformV2TranslationTrainingSessionExercise(
  userId: string,
  sessionId: string,
): Promise<PlatformTranslationExerciseSessionNextV2> {
  const { data, error } = await supabase.rpc(
    "read_platform_v2_translation_training_session_next",
    { p_user_id: userId, p_session_id: sessionId },
  );
  if (error) throw error;
  const item = record(data);
  if (item.status === "ready") {
    const candidate = parseCandidate(item);
    if (candidate && text(item.sessionId) && positive(item.ordinal))
      return { ...candidate, status: "ready", sessionId: item.sessionId, ordinal: item.ordinal };
  }
  if (["completed", "exhausted", "superseded", "not-member"].includes(item.status))
    return { status: item.status, ...(text(item.sessionId) ? { sessionId: item.sessionId } : {}), ...(integer(item.completedActions) ? { completedActions: item.completedActions } : {}), ...(integer(item.requestedTotal) ? { requestedTotal: item.requestedTotal } : {}) };
  if (item.status === "unavailable" && text(item.sessionId) && positive(item.ordinal) && text(item.targetId) && ["projection-missing", "dictionary-access-revoked", "pair-excluded"].includes(item.reason) && integer(item.remaining))
    return { status: "unavailable", sessionId: item.sessionId, ordinal: item.ordinal, targetId: item.targetId, reason: item.reason, remaining: item.remaining };
  throw new Error("invalid_platform_v2_translation_session_next");
}

export async function markPlatformV2TranslationTrainingSessionMemberUnavailable(
  userId: string,
  sessionId: string,
  targetId: string,
  reason: "projection-missing" | "dictionary-access-revoked" | "entry-not-found" | "pair-excluded",
) {
  const { data, error } = await supabase.rpc(
    "mark_platform_v2_translation_session_member_unavailable",
    { p_user_id: userId, p_session_id: sessionId, p_target_id: targetId, p_reason: reason },
  );
  if (error) throw error;
  const result = record(data);
  if (!["unavailable", "unavailable-exhausted", "consumed", "not-member", "out-of-order"].includes(result.status)) throw new Error("invalid_platform_v2_translation_unavailable_response");
  return result;
}

export async function performPlatformV2TranslationExerciseAction(input: {
  trainingSessionId: string;
  clientEventId: string;
  candidate: PlatformTranslationExerciseCandidateV2;
  reviewResult: PlatformTrainingExerciseReviewResultV2;
}): Promise<PlatformTranslationExerciseActionResponseV2> {
  const headers = await platformV2AuthenticatedJsonHeaders();
  const request = {
      actionId: "review-exercise", clientEventId: input.clientEventId,
      trainingSessionId: input.trainingSessionId,
      target: { kind: "training-exercise", targetId: input.candidate.targetId, family: "translation", direction: "recall", stateRevision: input.candidate.state?.stateRevision ?? "untracked" },
      reviewResult: input.reviewResult,
    };
  let response: Response;
  try {
    response = await platformFetchWithTimeout("/api/platform/v2/actions", {
      method: "POST", credentials: "same-origin", cache: "no-store", headers: { ...Object.fromEntries(new Headers(headers).entries()), "x-platform-action-attempt": "1" },
      body: JSON.stringify(request),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!(error instanceof TypeError) && message !== "Failed to fetch" && message !== "platform_request_timeout") throw error;
    response = await platformFetchWithTimeout("/api/platform/v2/actions/reconcile", {
      method: "POST", credentials: "same-origin", cache: "no-store", headers,
      body: JSON.stringify({ clientEventId: input.clientEventId, actionFamily: "translation" }),
    });
  }
  const payload = await json(response);
  if (!response.ok) throw new Error(text(record(payload).error) ? record(payload).error : "translation_exercise_action_failed");
  const value = record(payload);
  const exercise = record(value.exercise);
  const state = parseState(exercise.state);
  if (value.contractVersion !== "platform-action-v2" || value.actionId !== "review-exercise" || value.clientEventId !== input.clientEventId || value.accepted !== true || exercise.targetId !== input.candidate.targetId || exercise.targetKey !== input.candidate.targetKey || exercise.family !== "translation" || exercise.direction !== "recall" || !state) throw new Error("invalid_platform_v2_translation_action_response");
  return { contractVersion: "platform-action-v2", actionId: "review-exercise", clientEventId: input.clientEventId, accepted: true, exercise: { targetId: exercise.targetId, targetKey: exercise.targetKey, family: "translation", direction: "recall", state } };
}

function parseCandidate(value: unknown): PlatformTranslationExerciseCandidateV2 | null {
  const item = record(value); const state = item.state === null ? null : parseState(item.state);
  if (!text(item.targetId) || !text(item.targetKey) || item.family !== "translation" || item.direction !== "recall" || !text(item.entryId) || !text(item.contentNodeId) || !text(item.sourcePath) || !text(item.sourceRevision) || !text(item.sourceTextFingerprint) || !["new", "learning", "review"].includes(item.queueSource) || (item.state !== null && !state)) return null;
  return { targetId: item.targetId, targetKey: item.targetKey, family: "translation", direction: "recall", entryId: item.entryId, contentNodeId: item.contentNodeId, sourcePath: item.sourcePath, sourceRevision: item.sourceRevision, sourceTextFingerprint: item.sourceTextFingerprint, queueSource: item.queueSource, state };
}

function parseSession(value: unknown): PlatformTranslationExerciseSessionV2 | null {
  const item = record(value);
  if (item.contractVersion !== "platform-translation-exercise-session-v1" || !text(item.sessionId) || item.exerciseFamily !== "translation" || item.direction !== "recall" || !text(item.sessionSize) || !integer(item.requestedTotal) || !integer(item.plannedNew) || !integer(item.plannedReview) || item.plannedPractice !== 0 || !integer(item.plannedTotal) || !text(item.plannedAt) || !["active", "superseded"].includes(item.runStatus) || (item.runStatus === "active" && !positive(item.runGeneration)) || (item.runStatus === "superseded" && item.runGeneration !== null) || !integer(item.completedActions) || (item.completionReason !== null && !["completed", "exhausted"].includes(item.completionReason)) || !Array.isArray(item.members)) return null;
  const members = item.members.map((member: unknown) => {
    const row = record(member);
    return positive(row.ordinal) && text(row.targetId) && ["new", "learning", "review"].includes(row.queueSource) && (row.consumedAt === null || text(row.consumedAt)) && (row.unavailableAt === null || text(row.unavailableAt)) && (row.unavailableReason === null || text(row.unavailableReason)) && text(row.entryId) && text(row.contentNodeId) && row.family === "translation" && row.direction === "recall" ? row : null;
  });
  if (members.some((member) => member === null)) return null;
  return { ...item, members } as PlatformTranslationExerciseSessionV2;
}

function parseState(value: unknown): PlatformTrainingExerciseStateV2 | null {
  const item = record(value); const lastResult = item.lastResult;
  if (!text(item.stateRevision) || !integer(item.fsrsReps) || !integer(item.fsrsLapses) || !integer(item.seenCount) || !integer(item.successCount) || typeof item.fsrsEnabled !== "boolean" || typeof item.hidden !== "boolean" || typeof item.inLearning !== "boolean" || (lastResult !== null && !["fail", "hard", "success", "easy"].includes(lastResult))) return null;
  return { stateRevision: item.stateRevision, fsrsStability: nullableNumber(item.fsrsStability), fsrsDifficulty: nullableNumber(item.fsrsDifficulty), fsrsReps: item.fsrsReps, fsrsLapses: item.fsrsLapses, fsrsLastGrade: nullableNumber(item.fsrsLastGrade), fsrsLastInterval: nullableNumber(item.fsrsLastInterval), fsrsTargetRetention: nullableNumber(item.fsrsTargetRetention), fsrsParamsVersion: typeof item.fsrsParamsVersion === "string" ? item.fsrsParamsVersion : null, fsrsEnabled: item.fsrsEnabled, nextReviewAt: nullableText(item.nextReviewAt), lastSeenAt: nullableText(item.lastSeenAt), lastReviewedAt: nullableText(item.lastReviewedAt), seenCount: item.seenCount, successCount: item.successCount, lastResult: lastResult ?? null, hidden: item.hidden, frozenUntil: nullableText(item.frozenUntil), inLearning: item.inLearning, learningDueAt: nullableText(item.learningDueAt) };
}
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function integer(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
function positive(value: unknown): value is number { return integer(value) && value > 0; }
function nullableText(value: unknown): string | null { return typeof value === "string" ? value : null; }
function nullableNumber(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
async function json(response: Response): Promise<unknown> { try { return await response.json(); } catch { return null; } }
