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
export function providerFetch(input: string | URL | Request, init: RequestInit = {}) {
  const signal = deadlines.getStore()?.signal;
  if (signal?.aborted) throw new ProviderOperationTimeout("provider_timeout");
  return fetch(input, { ...init, ...(signal ? { signal: init.signal ? AbortSignal.any([signal, init.signal]) : signal } : {}) });
}
/** SDK attempts inherit the remaining operation budget, including voice fallback.
 * Keep GAX's cancellable promise: the generated public method chains .then and
 * drops cancel(), so callers use its initialized unary innerApiCalls boundary.
 */
export async function providerCancellableCall<T>(start: (remainingMs: number) => Promise<T> & { cancel(): void }): Promise<T> {
  const context = deadlines.getStore();
  const remaining = context ? context.deadlineAt - Date.now() : PROVIDER_OPERATION_MS;
  if (remaining <= 0 || context?.signal.aborted) throw new ProviderOperationTimeout("provider_timeout");
  const call = start(remaining);
  const cancel = () => call.cancel();
  context?.signal.addEventListener("abort", cancel, { once: true });
  try { return await call; }
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
