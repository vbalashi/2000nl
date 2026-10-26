import {
  TRAINING_EXERCISE_IDENTITY_VERSION,
  type TrainingExerciseFamily,
  type TrainingExerciseIdentity,
  type TrainingExerciseIdentityInput,
} from "../types/trainingExercise";

export function createTrainingExerciseIdentity(
  input: TrainingExerciseIdentityInput,
): TrainingExerciseIdentity {
  const entryId = normalizeIdentifier(input.entryId);
  const contentNodeId = normalizeOptionalIdentifier(input.contentNodeId);
  if (!entryId || !isValidCombination(input.family, input.direction, contentNodeId)) {
    throw new Error("invalid_training_exercise_identity");
  }

  return {
    schemaVersion: TRAINING_EXERCISE_IDENTITY_VERSION,
    entryId,
    contentNodeId,
    family: input.family,
    direction: input.direction,
  };
}

/**
 * Produces a stable, human-inspectable key for database uniqueness and action
 * idempotency. Opaque identifiers are escaped so delimiter characters cannot
 * create an accidental collision.
 */
export function trainingExerciseIdentityKey(
  identity: TrainingExerciseIdentity,
): string {
  const target = identity.contentNodeId ?? "entry";
  return [
    identity.schemaVersion,
    identity.family,
    identity.direction,
    identity.entryId,
    target,
  ]
    .map(encodeURIComponent)
    .join(":");
}

function isValidCombination(
  family: TrainingExerciseFamily,
  direction: TrainingExerciseIdentityInput["direction"],
  contentNodeId: string | null,
): boolean {
  if (family === "meaning") {
    return contentNodeId === null && (direction === "direct" || direction === "reverse");
  }
  if (family === "idiom") {
    return contentNodeId !== null && (direction === "direct" || direction === "reverse");
  }
  return family === "translation" && contentNodeId !== null && direction === "recall";
}

function normalizeIdentifier(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOptionalIdentifier(value: unknown): string | null {
  return value === undefined || value === null ? null : normalizeIdentifier(value);
}
