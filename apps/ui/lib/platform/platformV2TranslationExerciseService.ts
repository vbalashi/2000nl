import type {
  PlatformTranslationExerciseCandidateV2,
  PlatformTranslationExerciseCandidatesResponseV2,
  PlatformTrainingExerciseStateV2,
} from "../../../../packages/shared/types/platformV2";
import type { AuthenticatedSupabase, ServiceSupabase } from "./serverSupabase";
import type { PlatformV2TranslationExerciseRequest } from "./platformV2TranslationExerciseRequest";

export type PlatformV2TranslationExerciseOperationResult = {
  payload: unknown;
  status: number;
};

export async function performPlatformV2TranslationExerciseCandidates(
  auth: AuthenticatedSupabase,
  service: ServiceSupabase,
  request: PlatformV2TranslationExerciseRequest,
): Promise<PlatformV2TranslationExerciseOperationResult> {
  const { data, error } = await service.supabase.rpc(
    "read_platform_v2_translation_candidates_as_principal_v1",
    {
      p_user_id: auth.user.id,
      p_limit: request.limit,
      p_offset: request.offset,
    },
  );
  if (error) {
    return { payload: { error: "platform_v2_translation_exercise_read_failed" }, status: 500 };
  }

  const result = asRecord(data);
  let invalidCandidate = false;
  const items = Array.isArray(result.items)
    ? result.items.map((item) => {
        const candidate = parseCandidate(item);
        if (!candidate) invalidCandidate = true;
        return candidate;
      })
    : null;
  if (
    result.family !== "translation" ||
    result.direction !== "recall" ||
    items === null ||
    invalidCandidate
  ) {
    return { payload: { error: "invalid_platform_v2_translation_exercise_response" }, status: 500 };
  }

  const payload: PlatformTranslationExerciseCandidatesResponseV2 = {
    contractVersion: "platform-translation-exercise-candidates-v1",
    family: "translation",
    direction: "recall",
    items: items as PlatformTranslationExerciseCandidateV2[],
  };
  return { payload, status: 200 };
}

function parseCandidate(value: unknown): PlatformTranslationExerciseCandidateV2 | null {
  const candidate = asRecord(value);
  if (
    !nonEmptyString(candidate.targetId) ||
    !nonEmptyString(candidate.targetKey) ||
    candidate.family !== "translation" ||
    candidate.direction !== "recall" ||
    !nonEmptyString(candidate.entryId) ||
    !nonEmptyString(candidate.contentNodeId) ||
    !nonEmptyString(candidate.sourcePath) ||
    !nonEmptyString(candidate.sourceRevision) ||
    !nonEmptyString(candidate.sourceTextFingerprint) ||
    (candidate.queueSource !== "new" &&
      candidate.queueSource !== "learning" &&
      candidate.queueSource !== "review")
  ) {
    return null;
  }
  const state = candidate.state === null ? null : parseState(candidate.state);
  if (candidate.state !== null && !state) return null;
  return {
    targetId: candidate.targetId,
    targetKey: candidate.targetKey,
    family: "translation",
    direction: "recall",
    entryId: candidate.entryId,
    contentNodeId: candidate.contentNodeId,
    sourcePath: candidate.sourcePath,
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
  ) return null;
  const lastResult = state.lastResult;
  if (
    lastResult !== null &&
    lastResult !== "fail" &&
    lastResult !== "hard" &&
    lastResult !== "success" &&
    lastResult !== "easy"
  ) return null;
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
function integerAtLeastZero(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
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
