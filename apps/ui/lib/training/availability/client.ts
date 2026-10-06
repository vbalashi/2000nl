import { authenticatedAccountRequest } from "@/lib/preferences/accountRequest";
import { parseTrainingAvailability, type TrainingAvailabilityRecipe } from "./model";
export async function fetchTrainingAvailability(ownerId: string, recipe: TrainingAvailabilityRecipe, signal: AbortSignal) {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(() => controller.abort(), 15000);
    let retry = false;
    try {
      const response = await authenticatedAccountRequest("/api/training/availability", ownerId, {
        method: "POST", signal: controller.signal, body: JSON.stringify({ languageCode: recipe.languageCode, draft: recipe.draft }),
      });
      signal.throwIfAborted();
      retry = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retry) {
        const result = response.ok ? parseTrainingAvailability(await response.json()) : null;
        if (!result) throw new Error("training_availability_unavailable");
        return result;
      }
    } catch (error) {
      signal.throwIfAborted();
      // Network failure or our per-attempt deadline; never retry account/contract errors.
      retry = error instanceof TypeError || controller.signal.aborted;
      if (!retry) throw error;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
    }
    if (!retry || attempt === 2) throw new Error("training_availability_unavailable");
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, attempt === 0 ? 500 : 1500);
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
    });
  }
  throw new Error("training_availability_unavailable");
}
