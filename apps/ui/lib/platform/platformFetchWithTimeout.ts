export const DEFAULT_PLATFORM_FETCH_TIMEOUT_MS = 12_000;

export function forwardAbortSignal(
  source: AbortSignal | null | undefined,
  target: AbortController,
) {
  if (!source) return () => undefined;
  const abort = () => target.abort(source.reason);
  if (source.aborted) {
    abort();
    return () => undefined;
  }
  source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

export async function platformFetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_PLATFORM_FETCH_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const parentSignal = init.signal;
  let timedOut = false;
  const detachParentSignal = forwardAbortSignal(parentSignal, controller);

  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error("platform_request_timeout");
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    detachParentSignal();
  }
}

/** Bound the whole operation, including auth and body reads, even when a
 * suspended dependency does not settle after its AbortSignal is cancelled. */
export async function withPlatformRequestTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_PLATFORM_FETCH_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const detach = forwardAbortSignal(signal, controller);
  let timedOut = false;
  let abort: (() => void) | undefined;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await new Promise<T>((resolve, reject) => {
      abort = () => reject(timedOut
        ? new Error("platform_request_timeout")
        : new DOMException("Aborted", "AbortError"));
      if (controller.signal.aborted) { abort(); return; }
      controller.signal.addEventListener("abort", abort, { once: true });
      try {
        operation(controller.signal).then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  } finally {
    globalThis.clearTimeout(timeout);
    if (abort) controller.signal.removeEventListener("abort", abort);
    detach();
  }
}
