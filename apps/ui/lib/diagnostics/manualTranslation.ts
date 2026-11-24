import { beginProviderAction } from "./client";

type Result = "ready" | "failed" | "pending";

/** An explicit translation request may stop observing while its server job remains pending. */
export async function observeManualTranslation(request: () => Promise<Result>, signal?: AbortSignal): Promise<Result> {
  const finish = beginProviderAction("dictionary_translation");
  try {
    const result = await request();
    finish?.(signal?.aborted ? "cancelled" : result);
    return result;
  } catch (error) {
    finish?.(signal?.aborted ? "cancelled" : "failed");
    throw error;
  }
}
