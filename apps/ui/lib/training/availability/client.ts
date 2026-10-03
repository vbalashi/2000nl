import { authenticatedAccountRequest } from "@/lib/preferences/accountRequest";
import { parseTrainingAvailability, type TrainingAvailabilityRecipe } from "./model";
export async function fetchTrainingAvailability(ownerId: string, recipe: TrainingAvailabilityRecipe, signal: AbortSignal) {
  const response = await authenticatedAccountRequest("/api/training/availability", ownerId, {
    method: "POST", signal, body: JSON.stringify(recipe),
  });
  const result = response.ok ? parseTrainingAvailability(await response.json()) : null;
  if (!result) throw new Error("training_availability_unavailable");
  return result;
}
