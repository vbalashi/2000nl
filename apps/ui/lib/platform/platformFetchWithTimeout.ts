import {
  observeTrainingRequest,
  linkTrainingRequest,
  currentDisplayedLoadId,
} from "../diagnostics/client";
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
  const startedAt = performance.now();
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const monitored = typeof window !== "undefined" && url.startsWith("/api/");
  const headers = monitored ? new Headers(init.headers) : undefined;
  const requestId = monitored ? diagnosticRequestId() : undefined;
  if (requestId) headers!.set("x-request-id", requestId);
  const displayId = monitored ? currentDisplayedLoadId() : undefined;
  if (displayId) headers!.set("x-training-display-id", displayId);
  const transitionId = headers?.get("x-training-transition-id") ?? undefined;
  try {
    if (requestId) {
      linkTrainingRequest(transitionId, requestId);
      linkTrainingRequest(displayId, requestId);
    }
  } catch {
    /* Non-critical diagnostics. */
  }
  const report = (
    result: "ready" | "failed" | "cancelled",
    status?: number,
  ) => {
    try {
      if (requestId)
        observeTrainingRequest({
          requestId,
          transitionId,
          displayId,
          result,
          status,
          durationMs: performance.now() - startedAt,
        });
    } catch {
      /* Non-critical diagnostics. */
    }
  };
  const controller = new AbortController();
  const parentSignal = init.signal;
  let timedOut = false;
  const detachParentSignal = forwardAbortSignal(parentSignal, controller);

  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      ...(headers ? { headers } : {}),
      signal: controller.signal,
    });
    report(response.ok ? "ready" : "failed", response.status);
    return response;
  } catch (error) {
    report(!timedOut && parentSignal?.aborted ? "cancelled" : "failed");
    if (timedOut) throw new Error("platform_request_timeout");
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    detachParentSignal();
  }
}

function diagnosticRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return undefined;
  }
}
