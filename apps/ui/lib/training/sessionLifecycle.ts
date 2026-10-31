/** Shared UI lifecycle contract; scheduling and terminal verdicts remain server-owned. */
export type TrainingSessionProgress = {
  sessionId: string;
  completedActions: number;
  completionReason: "completed" | "exhausted" | null;
};

export function canContinueTrainingSession(input: {
  completedActions: number;
  plannedTotal: number | null;
  completionReason?: string | null;
  runStatus?: string;
  exhausted?: boolean;
}): boolean {
  return input.runStatus !== "superseded" && !input.completionReason && !input.exhausted &&
    (input.plannedTotal === null || input.completedActions < input.plannedTotal);
}

export type ResumeSnapshotClassification =
  | { kind: "missing" }
  | { kind: "superseded" }
  | { kind: "no-remaining-member" }
  | { kind: "resumable" };

export function classifyResumeSnapshot(
  snapshot: {
    runStatus?: string;
    completedActions?: number;
    plannedTotal?: number;
    completionReason?: string | null;
    members: readonly { consumedAt: string | null; unavailableAt: string | null }[];
  } | null,
): ResumeSnapshotClassification {
  if (!snapshot) return { kind: "missing" };
  if (snapshot.runStatus === "superseded") return { kind: "superseded" };
  if (!canContinueTrainingSession({
    ...snapshot,
    completedActions: snapshot.completedActions ?? 0,
    plannedTotal: snapshot.plannedTotal ?? null,
  })) return { kind: "no-remaining-member" };
  if (!snapshot.members.some((member) => !member.consumedAt && !member.unavailableAt)) {
    return { kind: "no-remaining-member" };
  }
  return { kind: "resumable" };
}
