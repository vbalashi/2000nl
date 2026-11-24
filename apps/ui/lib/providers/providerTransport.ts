import { httpAttemptOutcome, recordProviderEvent, rpcAttemptOutcome, type MeasuredProvider } from "./providerDiagnostics";
import { AsyncLocalStorage } from "node:async_hooks";

const deadlines = new AsyncLocalStorage<{ signal: AbortSignal; deadlineAt: number }>();
export class ProviderOperationTimeout extends Error {}
export function providerOutputTokenLimit() {
  const value = Number(process.env.PROVIDER_TRANSLATION_MAX_OUTPUT_TOKENS ?? 8192);
  if (!Number.isSafeInteger(value) || value < 1 || value > 32768) throw new Error("invalid_provider_safety_configuration");
  return value;
}
export const PROVIDER_OPERATION_MS = 240_000; // lease is 300s, leaving DB publication margin
/** All fetch-based primary/retry/fallback calls inherit this operation's deadline. */
export function providerFetch(input: string | URL | Request, init: RequestInit = {}, provider?: MeasuredProvider, inputCharacters?: number) {
  const signal = deadlines.getStore()?.signal;
  if (signal?.aborted) throw new ProviderOperationTimeout("provider_timeout");
  const options = { ...init, ...(signal ? { signal: init.signal ? AbortSignal.any([signal, init.signal]) : signal } : {}) };
  if (options.signal?.aborted) throw new ProviderOperationTimeout("provider_timeout");
  const startedAt = performance.now();
  const attempted = fetch(input, options);
  if (!provider) return attempted;
  return attempted.then(response => {
    recordProviderEvent({ kind: "transport_attempt", provider, inputCharacters, outcome: httpAttemptOutcome(response.status), durationMs: Math.round(performance.now() - startedAt) });
    return response;
  }, error => {
    recordProviderEvent({ kind: "transport_attempt", provider, inputCharacters, outcome: options.signal?.aborted ? "timeout" : "network_error", durationMs: Math.round(performance.now() - startedAt) });
    throw error;
  });
}
/** SDK attempts inherit the remaining operation budget, including voice fallback.
 * Keep GAX's cancellable promise: the generated public method chains .then and
 * drops cancel(), so callers use its initialized unary innerApiCalls boundary.
 */
export async function providerCancellableCall<T>(start: (remainingMs: number) => Promise<T> & { cancel(): void }, provider?: MeasuredProvider, inputCharacters?: number): Promise<T> {
  const context = deadlines.getStore();
  const remaining = context ? context.deadlineAt - Date.now() : PROVIDER_OPERATION_MS;
  if (remaining <= 0 || context?.signal.aborted) throw new ProviderOperationTimeout("provider_timeout");
  const startedAt = performance.now();
  const call = start(remaining);
  const cancel = () => call.cancel();
  context?.signal.addEventListener("abort", cancel, { once: true });
  try {
    const result = await call;
    if (provider) recordProviderEvent({ kind: "transport_attempt", provider, inputCharacters, outcome: "ok", durationMs: Math.round(performance.now() - startedAt) });
    return result;
  } catch (error) {
    if (provider) recordProviderEvent({ kind: "transport_attempt", provider, inputCharacters, outcome: context?.signal.aborted ? "timeout" : rpcAttemptOutcome(error), durationMs: Math.round(performance.now() - startedAt) });
    throw error;
  }
  finally { context?.signal.removeEventListener("abort", cancel); }
}
export async function withProviderDeadline<T>(operation: () => Promise<T>, timeoutMs = PROVIDER_OPERATION_MS): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await deadlines.run({ signal: controller.signal, deadlineAt: Date.now() + timeoutMs }, () => Promise.race([
      operation(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ProviderOperationTimeout("provider_timeout")); }, timeoutMs); }),
    ]));
  } finally { if (timer) clearTimeout(timer); }
}
