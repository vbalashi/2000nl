export type TrainingSetupPrerequisites = "pending" | "ready" | "error";

export type TrainingPilotSetupStatus =
  | "preparing"
  | "error"
  | "first-use"
  | "ready";

export function deriveTrainingPilotSetupStatus(input: {
  prerequisites: TrainingSetupPrerequisites;
  hasAvailableLists: boolean;
}): TrainingPilotSetupStatus {
  if (input.prerequisites === "pending") return "preparing";
  if (input.prerequisites === "error") return "error";
  return input.hasAvailableLists ? "ready" : "first-use";
}

export type TrainingReadinessRequestIdentity = {
  userId: string;
  scopeKey: string;
  generation: number;
};

export type TrainingReadinessRequestContext =
  TrainingReadinessRequestIdentity & { mounted: boolean };

export function isCurrentTrainingReadinessRequest(
  request: TrainingReadinessRequestIdentity,
  current: TrainingReadinessRequestContext,
): boolean {
  return (
    current.mounted &&
    request.userId === current.userId &&
    request.scopeKey === current.scopeKey &&
    request.generation === current.generation
  );
}
