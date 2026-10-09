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
