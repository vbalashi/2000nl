const DEFAULT_PLATFORM_FETCH_TIMEOUT_MS = 12_000;

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
