import type {
  TrainingExclusionRequest,
  TrainingExclusionResponse,
} from "../../../../packages/shared/types/trainingExclusion";
import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";
import { platformFetchWithTimeout } from "./platformFetchWithTimeout";
/** Retries must reuse the complete request, including its intentional event ID. */
export async function performTrainingExclusion(
  request: TrainingExclusionRequest,
): Promise<TrainingExclusionResponse> {
  const response = await platformFetchWithTimeout(
    "/api/platform/v2/training/exclusions",
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: await platformV2AuthenticatedJsonHeaders(),
      body: JSON.stringify(request),
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "training_exclusion_failed",
    );
  if (
    !data ||
    !["accepted", "duplicate"].includes(data.status) ||
    data.clientEventId !== request.clientEventId ||
    data.actionId !== request.actionId ||
    typeof data.exclusionId !== "string" ||
    !data.exclusionId ||
    data.excluded !== (request.actionId === "exclude-pair") ||
    !["meaning", "idiom", "translation"].includes(data.family)
  ) {
    throw new Error("invalid_training_exclusion_response");
  }
  return data;
}
