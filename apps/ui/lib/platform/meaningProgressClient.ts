import { publishPlatformV2CardStateChanged } from "./platformV2CardStateChanges";
import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";
import { invalidateTrainingAvailability } from "../training/availability/cache";
import {
  parseMeaningLearningProgress,
  type MeaningLearningProgress,
} from "../../../../packages/shared/types/meaningLearningProgress";
export async function fetchMeaningProgress(
  entryId: string,
  signal?: AbortSignal,
): Promise<MeaningLearningProgress> {
  const response = await fetch(
    `/api/training/meaning-progress?entryId=${encodeURIComponent(entryId)}`,
    {
      signal,
      cache: "no-store",
      headers: await platformV2AuthenticatedJsonHeaders(),
    },
  );
  if (!response.ok) throw new Error("meaning_progress_unavailable");
  return parseMeaningLearningProgress(await response.json());
}
export async function resumeMeaningProgress(
  progress: MeaningLearningProgress,
  clientEventId: string,
): Promise<MeaningLearningProgress> {
  const response = await fetch("/api/training/meaning-progress", {
    method: "POST",
    headers: await platformV2AuthenticatedJsonHeaders(),
    body: JSON.stringify({
      entryId: progress.entryId,
      revision: progress.revision,
      clientEventId,
    }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? "meaning_progress_conflict"
        : "meaning_resume_failed",
    );
  const receipt = await response.json();
  if (
    !["accepted", "duplicate"].includes(receipt.status) ||
    receipt.clientEventId !== clientEventId
  )
    throw new Error("invalid_meaning_resume_receipt");
  const next = parseMeaningLearningProgress(receipt.progress);
  invalidateTrainingAvailability();
  publishPlatformV2CardStateChanged(progress.entryId);
  return next;
}
