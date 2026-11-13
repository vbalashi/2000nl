import { parseMeaningLearningProgress } from "../../../../packages/shared/types/meaningLearningProgress";
import type { TrainingKnownChoiceRequest } from "../../../../packages/shared/types/trainingKnownChoice";
import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";
import { platformFetchWithTimeout } from "./platformFetchWithTimeout";
import { invalidateTrainingAvailability } from "../training/availability/cache";
import { publishPlatformV2CardStateChanged } from "./platformV2CardStateChanges";
export async function saveTrainingKnownChoice(request: TrainingKnownChoiceRequest) {
  const response = await platformFetchWithTimeout("/api/training/known-choice", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: await platformV2AuthenticatedJsonHeaders(), body: JSON.stringify(request),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(response.status === 409 ? "training_known_choice_conflict" : "training_known_choice_failed");
  if (!data || !["accepted", "duplicate"].includes(data.status) || data.clientEventId !== request.clientEventId ||
    data.entryId !== request.entryId || data.trainingSessionId !== request.trainingSessionId ||
    !["consumed", "consumed-complete"].includes(data.consumption?.status)) throw new Error("invalid_training_known_choice_receipt");
  const progress = parseMeaningLearningProgress(data.progress);
  if (progress.entryId !== request.entryId || progress.exclusionId || progress.directions.some(d => Boolean(d.knownMarkId) !== request.knownDirections.includes(d.cardTypeId))) throw new Error("invalid_training_known_choice_receipt");
  invalidateTrainingAvailability();
  publishPlatformV2CardStateChanged(request.entryId);
  return progress;
}
