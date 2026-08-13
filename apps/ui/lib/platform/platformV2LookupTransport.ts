import type {
  PlatformLookupV2Request,
  PlatformLookupV2Response,
} from "../../../../packages/shared/types/platformV2";
import { isPlatformLookupV2Response } from "../../../../packages/shared/types/platformV2Runtime";
import { platformFetchWithTimeout } from "./platformFetchWithTimeout";
import { forwardAbortSignal } from "./platformFetchWithTimeout";
import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";

export type PlatformV2LookupTransportResult =
  | {
      state: "ready";
      payload: PlatformLookupV2Response;
      response: Response;
    }
  | { state: "http-error"; status: number; response: Response }
  | { state: "contract-mismatch"; response: Response };

export async function requestPlatformV2Lookup(input: {
  body: PlatformLookupV2Request;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<PlatformV2LookupTransportResult> {
  const controller = new AbortController();
  const detach = forwardAbortSignal(input.signal, controller);
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs ?? 12_000);
  try {
    const headers = await raceWithAbort(
      platformV2AuthenticatedJsonHeaders(),
      controller.signal,
    );
    if (controller.signal.aborted) {
      if (timedOut) throw new Error("platform_request_timeout");
      throw new DOMException("Aborted", "AbortError");
    }
    const response = await platformFetchWithTimeout(
      "/api/platform/v2/lookup",
      {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers,
      body: JSON.stringify(input.body),
      },
      input.timeoutMs,
    );
    if (!response.ok) {
      return { state: "http-error", status: response.status, response };
    }

    const payload = await response.json().catch(() => null);
    if (!isPlatformLookupV2Response(payload)) {
      return { state: "contract-mismatch", response };
    }
    return { state: "ready", payload, response };
  } catch (error) {
    if (timedOut) throw new Error("platform_request_timeout");
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    detach();
  }
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}
