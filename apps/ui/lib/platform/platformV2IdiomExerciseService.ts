import type {
  PlatformIdiomExerciseCandidateV2,
  PlatformIdiomExerciseCandidatesResponseV2,
  PlatformTrainingExerciseStateV2,
} from "../../../../packages/shared/types/platformV2";
import type { AuthenticatedSupabase, ServiceSupabase } from "./serverSupabase";
import type { PlatformV2IdiomExerciseRequest } from "./platformV2IdiomExerciseRequest";

export type PlatformV2IdiomExerciseOperationResult = {
  payload: unknown;
  status: number;
};

export async function performPlatformV2IdiomExerciseCandidates(
  auth: AuthenticatedSupabase,
  service: ServiceSupabase,
  request: PlatformV2IdiomExerciseRequest,
): Promise<PlatformV2IdiomExerciseOperationResult> {
  const { data, error } = await service.supabase.rpc(
    "read_platform_v2_idiom_exercise_candidates_as_principal_v1",
    {
      p_user_id: auth.user.id,
      p_direction: request.direction,
      p_limit: request.limit,
      p_offset: request.offset,
    },
  );
  if (error) {
    return {
      payload: { error: "platform_v2_idiom_exercise_read_failed" },
      status: 500,
    };
  }

  const result = asRecord(data);
  let invalidCandidate = false;
  const items = Array.isArray(result.items)
    ? result.items.map((item) => {
        const candidate = parseCandidate(item, request.direction);
        if (!candidate) invalidCandidate = true;
        return candidate;
      })
    : null;
  if (
    result.family !== "idiom" ||
    result.direction !== request.direction ||
    items === null ||
    invalidCandidate
  ) {
    return {
      payload: { error: "invalid_platform_v2_idiom_exercise_response" },
      status: 500,
    };
  }

  const payload: PlatformIdiomExerciseCandidatesResponseV2 = {
    contractVersion: "platform-idiom-exercise-candidates-v2",
    family: "idiom",
    direction: request.direction,
    items: items as PlatformIdiomExerciseCandidateV2[],
  };
  return { payload, status: 200 };
}

function parseCandidate(
  value: unknown,
  direction: PlatformV2IdiomExerciseRequest["direction"],
): PlatformIdiomExerciseCandidateV2 | null {
  const candidate = asRecord(value);
  if (
    !nonEmptyString(candidate.targetId) ||
    !nonEmptyString(candidate.targetKey) ||
    candidate.family !== "idiom" ||
    candidate.direction !== direction ||
    !nonEmptyString(candidate.entryId) ||
    !nonEmptyString(candidate.contentNodeId) ||
    !nonEmptyString(candidate.expressionSourcePath) ||
    !nonEmptyString(candidate.explanationSourcePath) ||
    !nonEmptyString(candidate.sourceRevision) ||
    !nonEmptyString(candidate.sourceTextFingerprint) ||
    (candidate.queueSource !== "new" &&
      candidate.queueSource !== "learning" &&
      candidate.queueSource !== "review") ||
    !Array.isArray(candidate.exampleSourcePaths) ||
    !candidate.exampleSourcePaths.every(nonEmptyString)
  ) {
    return null;
  }
  const state = candidate.state === null ? null : parseState(candidate.state);
  if (candidate.state !== null && !state) return null;
  return {
    targetId: candidate.targetId,
    targetKey: candidate.targetKey,
    family: "idiom",
    direction,
    entryId: candidate.entryId,
    contentNodeId: candidate.contentNodeId,
    expressionSourcePath: candidate.expressionSourcePath,
    explanationSourcePath: candidate.explanationSourcePath,
    exampleSourcePaths: candidate.exampleSourcePaths,
    sourceRevision: candidate.sourceRevision,
    sourceTextFingerprint: candidate.sourceTextFingerprint,
    queueSource: candidate.queueSource,
    state,
  };
}

function parseState(value: unknown): PlatformTrainingExerciseStateV2 | null {
  const state = asRecord(value);
  if (
    !nonEmptyString(state.stateRevision) ||
    !integerAtLeastZero(state.fsrsReps) ||
    !integerAtLeastZero(state.fsrsLapses) ||
    !integerAtLeastZero(state.seenCount) ||
    !integerAtLeastZero(state.successCount) ||
    typeof state.fsrsEnabled !== "boolean" ||
    typeof state.hidden !== "boolean" ||
    typeof state.inLearning !== "boolean"
  ) {
    return null;
  }
  const lastResult = state.lastResult;
  if (
    lastResult !== null &&
    lastResult !== "fail" &&
    lastResult !== "hard" &&
    lastResult !== "success" &&
    lastResult !== "easy"
  ) {
    return null;
  }
  return {
    stateRevision: state.stateRevision,
    fsrsStability: nullableNumber(state.fsrsStability),
    fsrsDifficulty: nullableNumber(state.fsrsDifficulty),
    fsrsReps: state.fsrsReps,
    fsrsLapses: state.fsrsLapses,
    fsrsLastGrade: nullableNumber(state.fsrsLastGrade),
    fsrsLastInterval: nullableNumber(state.fsrsLastInterval),
    fsrsTargetRetention: nullableNumber(state.fsrsTargetRetention),
    fsrsParamsVersion: nullableString(state.fsrsParamsVersion),
    fsrsEnabled: state.fsrsEnabled,
    nextReviewAt: nullableString(state.nextReviewAt),
    lastSeenAt: nullableString(state.lastSeenAt),
    lastReviewedAt: nullableString(state.lastReviewedAt),
    seenCount: state.seenCount,
    successCount: state.successCount,
    lastResult,
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

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : nonEmptyString(value)
      ? value
      : null;
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined
    ? null
    : typeof value === "number" && Number.isFinite(value)
      ? value
      : null;
}

function integerAtLeastZero(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
