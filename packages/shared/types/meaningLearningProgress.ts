/** Current progress of one Entry's two ordinary learning directions. */
export type MeaningLearningStatus =
  | "new"
  | "learning"
  | "reviewing"
  | "partly-known"
  | "known"
  | "excluded";
export type MeaningDirectionProgress = {
  cardTypeId: "word-to-definition" | "definition-to-word";
  stateRevision: string;
  knownMarkId: string | null;
  knownMarkRevision: string | null;
  knownMarkedAt: string | null;
  phase: "new" | "learning" | "reviewing" | "hidden" | "frozen";
  presentations: number;
  gradedAttempts: number;
  lastGrade: 1 | 2 | 3 | 4 | null;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  stability: number | null;
  difficulty: number | null;
};
export type MeaningLearningProgress = {
  entryId: string;
  headword: string;
  exclusionId: string | null;
  revision: string;
  directions: MeaningDirectionProgress[];
};
export function meaningLearningStatus(
  progress: MeaningLearningProgress,
): MeaningLearningStatus {
  if (progress.exclusionId) return "excluded";
  const known = progress.directions.filter((d) => d.knownMarkId).length;
  if (known === 2) return "known";
  if (known === 1) return "partly-known";
  if (progress.directions.every((d) => d.phase === "new")) return "new";
  return progress.directions.every((d) => d.phase === "reviewing")
    ? "reviewing"
    : "learning";
}

/** Reject incomplete transport snapshots before exposing controls or statistics. */
export function parseMeaningLearningProgress(
  value: unknown,
): MeaningLearningProgress {
  const record = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  const timestamp = (v: unknown) =>
    v === null || (typeof v === "string" && Number.isFinite(Date.parse(v)));
  const nullableNumber = (v: unknown) =>
    v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
  if (
    !record(value) ||
    typeof value.entryId !== "string" ||
    typeof value.headword !== "string" ||
    typeof value.revision !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.revision) ||
    (value.exclusionId !== null && typeof value.exclusionId !== "string") ||
    !Array.isArray(value.directions) ||
    value.directions.length !== 2
  )
    throw new Error("invalid_meaning_progress");
  const types = new Set();
  for (const d of value.directions) {
    if (
      !record(d) ||
      !["word-to-definition", "definition-to-word"].includes(
        String(d.cardTypeId),
      ) ||
      types.has(d.cardTypeId) ||
      typeof d.stateRevision !== "string" ||
      !["new", "learning", "reviewing", "hidden", "frozen"].includes(
        String(d.phase),
      ) ||
      !Number.isInteger(d.presentations) ||
      Number(d.presentations) < 0 ||
      !Number.isInteger(d.gradedAttempts) ||
      Number(d.gradedAttempts) < 0 ||
      (d.lastGrade !== null && ![1, 2, 3, 4].includes(Number(d.lastGrade))) ||
      !nullableNumber(d.stability) ||
      !nullableNumber(d.difficulty) ||
      !timestamp(d.lastReviewedAt) ||
      !timestamp(d.nextReviewAt) ||
      !timestamp(d.knownMarkedAt) ||
      (d.knownMarkId !== null && typeof d.knownMarkId !== "string") ||
      (d.knownMarkRevision !== null && typeof d.knownMarkRevision !== "string")
    )
      throw new Error("invalid_meaning_progress");
    if (
      Boolean(d.knownMarkId) !== Boolean(d.knownMarkRevision) ||
      Boolean(d.knownMarkId) !== Boolean(d.knownMarkedAt)
    )
      throw new Error("invalid_meaning_progress");
    types.add(d.cardTypeId);
  }
  return value as unknown as MeaningLearningProgress;
}
