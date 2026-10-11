import { fetchDictionaryMeaningTranslation } from "./translationApiClient";
import { recordTranslationPreparationDuration } from "./translationPreparationTiming";

type TranslationInput = Parameters<typeof fetchDictionaryMeaningTranslation>[0];

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      finish();
      reject(new DOMException("The operation was aborted", "AbortError"));
    };
    const timer = setTimeout(() => { finish(); resolve(); }, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Observe durable work; stopping observation never cancels or resets a job. */
export async function observeDictionaryMeaningTranslation(
  input: TranslationInput,
  options: { observationMs?: number; pollMs?: number } = {},
): Promise<Response> {
  const deadline = Date.now() + (options.observationMs ?? 300_000);
  const startedAt = Date.now();
  let observedJob = false;
  let response = await fetchDictionaryMeaningTranslation(input);
  while (response.ok) {
    const payload = await response.clone().json().catch(() => null) as {
      status?: string;
      job?: { id?: string };
      needsEnqueue?: boolean;
    } | null;
    // Legacy synchronous responses retain their existing caller semantics.
    if (payload?.status === "ready" && observedJob)
      recordTranslationPreparationDuration(Date.now() - startedAt);
    if (payload?.status !== "pending" || !payload.job?.id || input.background)
      return response;
    observedJob = true;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return response;
    await pause(Math.min(options.pollMs ?? 1_000, remaining), input.signal);
    const requestRemaining = deadline - Date.now();
    if (requestRemaining <= 0) return response;
    try {
      response = await fetchDictionaryMeaningTranslation({
        ...input,
        force: false,
        observeOnly: !payload.needsEnqueue,
        timeoutMs: Math.min(input.timeoutMs ?? 20_000, requestRemaining),
      });
    } catch (error) {
      // An observation deadline is not evidence of a failed server job.
      if (error instanceof Error && error.message === "platform_request_timeout")
        return response;
      throw error;
    }
  }
  return response;
}
