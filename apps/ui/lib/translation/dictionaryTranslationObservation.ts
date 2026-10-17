import { fetchDictionaryMeaningTranslation } from "./translationApiClient";
import { recordTranslationPreparationDuration } from "./translationPreparationTiming";
import { publishDictionaryTranslationReady, watchDictionaryTranslation } from "./dictionaryTranslationEvents";

type TranslationInput = Parameters<typeof fetchDictionaryMeaningTranslation>[0];

function pause(ms: number, signal?: AbortSignal, subscribeWake?: (wake: () => void) => () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      stopWake?.();
    };
    const abort = () => {
      finish();
      reject(new DOMException("The operation was aborted", "AbortError"));
    };
    let stopWake: (() => void) | undefined;
    const timer = setTimeout(() => { finish(); resolve(); }, ms);
    stopWake = subscribeWake?.(() => { finish(); resolve(); });
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
  let connected = false;
  let hinted = false;
  let wake: (() => void) | undefined;
  let stopRemote: (() => void) | undefined;
  let finalProbe = false;
  try {
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
      if (!stopRemote && options.pollMs === undefined) {
        stopRemote = watchDictionaryTranslation({ entryId: input.entryId, targetLanguageCode: input.targetLanguageCode }, () => {
          hinted = true;
          wake?.();
        }, state => {
          connected = state.status === "connected";
          // Close the subscribe/read race and recover any missed reconnect events.
          if (connected) { hinted = true; wake?.(); }
          // Degradation switches a healthy long wait to bounded recovery promptly.
          if (state.status === "degraded") wake?.();
        });
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0 || finalProbe) return response;
      // Connected readers wake on server hints, with sparse lost-message safety.
      // Degraded readers retain bounded backoff; explicit intervals stay fixed.
      const delay = hinted ? 0 : connected && !payload.needsEnqueue ? 60_000 : pollDelayMs;
      // Reserve a final authoritative read before the observation budget expires.
      const finalProbeMs = Math.max(0, remaining - Math.min(1_000, remaining / 2));
      const probeBoundary = Date.now() + finalProbeMs;
      await pause(Math.min(delay, connected ? finalProbeMs : remaining), input.signal, notify => {
        wake = notify;
        return () => { if (wake === notify) wake = undefined; };
      });
      finalProbe = connected && Date.now() >= probeBoundary;
      hinted = false;
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
  } finally { stopRemote?.(); }
}

function isObservationInterruption(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && error.message === "platform_request_timeout");
}
function pendingObservation() {
  return new Response(JSON.stringify({ status: "pending" }), { headers: { "content-type": "application/json" } });
}
