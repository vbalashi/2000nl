/**
 * Stable identity for one non-ordinary Training Exercise.
 *
 * Ordinary meaning cards intentionally retain their existing entry-level
 * identity. Content-bound families must name the exact source Content Node so
 * two idioms under one Dictionary Meaning cannot share state accidentally.
 */
export const TRAINING_EXERCISE_IDENTITY_VERSION = "training-exercise-v1" as const;

export type TrainingExerciseFamily =
  | "meaning"
  | "idiom"
  | "translation";

export type TrainingExerciseDirection =
  | "direct"
  | "reverse"
  | "recall";

export type TrainingExerciseIdentity = {
  schemaVersion: typeof TRAINING_EXERCISE_IDENTITY_VERSION;
  entryId: string;
  /** Null preserves the existing entry-level identity for ordinary meanings. */
  contentNodeId: string | null;
  family: TrainingExerciseFamily;
  direction: TrainingExerciseDirection;
};

export type TrainingExerciseIdentityInput = {
  entryId: string;
  contentNodeId?: string | null;
  family: TrainingExerciseFamily;
  direction: TrainingExerciseDirection;
};
