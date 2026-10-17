import { fetchDictionaryMeaningTranslation } from "./translationApiClient";
import { recordTranslationPreparationDuration } from "./translationPreparationTiming";
import { publishDictionaryTranslationReady } from "./dictionaryTranslationEvents";

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
  let pollDelayMs = options.pollMs ?? 1_000;
  let response: Response;
  try { response = await fetchDictionaryMeaningTranslation(input); }
  catch (error) {
    if (input.signal?.aborted) throw error;
    if (isObservationInterruption(error)) return pendingObservation();
    throw error;
  }
  if (response.status === 429 || response.status >= 500) return pendingObservation();
  while (response.ok) {
    const payload = await response.clone().json().catch(() => null) as {
      status?: string;
      job?: { id?: string };
      needsEnqueue?: boolean;
    } | null;
    // Legacy synchronous responses retain their existing caller semantics.
    if (payload?.status === "ready" && observedJob)
      recordTranslationPreparationDuration(Date.now() - startedAt);
    if (payload?.status === "ready") publishDictionaryTranslationReady({
      entryId: input.entryId, targetLanguageCode: input.targetLanguageCode,
    });
    if (payload?.status !== "pending" || (!payload.job?.id && !payload.needsEnqueue) || input.background)
      return response;
    observedJob = true;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return response;
    // Keep first readiness feedback prompt, then reduce repeated reads while
    // durable work runs. An explicit interval remains fixed for callers.
    await pause(Math.min(pollDelayMs, remaining), input.signal);
    if (options.pollMs === undefined) pollDelayMs = Math.min(pollDelayMs * 2, 5_000);
    const requestRemaining = deadline - Date.now();
    if (requestRemaining <= 0) return response;
    try {
      const next = await fetchDictionaryMeaningTranslation({
        ...input,
        force: false,
        observeOnly: !payload.needsEnqueue,
        timeoutMs: Math.min(input.timeoutMs ?? 20_000, requestRemaining),
      });
      if (next.status === 429 || next.status >= 500) return response;
      response = next;
    } catch (error) {
      // An observation deadline is not evidence of a failed server job.
      if (!input.signal?.aborted && isObservationInterruption(error))
        return response;
      throw error;
    }
  }
  return response;
}

function isObservationInterruption(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && error.message === "platform_request_timeout");
}
function pendingObservation() {
  return new Response(JSON.stringify({ status: "pending" }), { headers: { "content-type": "application/json" } });
}
