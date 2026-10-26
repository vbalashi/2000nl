import type { LibrarySearchScope, LibrarySearchSummary } from "./librarySearchScope";
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
      payload: PlatformLookupV2Response & { librarySearch?: LibrarySearchSummary };
      response: Response;
    }
  | { state: "http-error"; status: number; response: Response }
  | { state: "contract-mismatch"; response: Response };

export async function requestPlatformV2Lookup(input: {
  body: PlatformLookupV2Request;
  expectedUserId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  libraryScope?: LibrarySearchScope;
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
      input.expectedUserId?platformV2AuthenticatedJsonHeaders(input.expectedUserId):platformV2AuthenticatedJsonHeaders(),
      controller.signal,
    );
    if (controller.signal.aborted) {
      if (timedOut) throw new Error("platform_request_timeout");
      throw new DOMException("Aborted", "AbortError");
    }
    const response = await platformFetchWithTimeout(
      input.libraryScope ? "/api/library/search" : "/api/platform/v2/lookup",
      {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        ...input.body,
        ...(input.libraryScope ? {
          dictionaryIds: input.libraryScope.dictionaryIds,
          ...(input.libraryScope.material ? { material: input.libraryScope.material } : {}),
          ...(input.libraryScope.filters ? { filters: input.libraryScope.filters } : {}),
        } : {}),
      }),
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
    if ((input.libraryScope?.filters || input.libraryScope?.material) && !validLibrarySearchSummary(payload, Boolean(input.libraryScope?.material)))
      return { state: "contract-mismatch", response };
    if(input.expectedUserId)await raceWithAbort(platformV2AuthenticatedJsonHeaders(input.expectedUserId),controller.signal);
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

function validLibrarySearchSummary(payload: PlatformLookupV2Response, material = false): payload is PlatformLookupV2Response & { librarySearch: LibrarySearchSummary } {
  const summary = (payload as PlatformLookupV2Response & { librarySearch?: unknown }).librarySearch;
  if (!summary || typeof summary !== "object") return false;
  const { totalGroups, matchingEntryIds, unavailableEntryCount } = summary as Record<string, unknown>;
  if (material && (!Number.isSafeInteger(unavailableEntryCount) || Number(unavailableEntryCount) < 0)) return false;
  if (!Number.isSafeInteger(totalGroups) || Number(totalGroups) < payload.groups.length ||
    !Array.isArray(matchingEntryIds) ||
    matchingEntryIds.some(id => typeof id !== "string" || !id.length || id.length > 128) ||
    new Set(matchingEntryIds).size !== matchingEntryIds.length) return false;
  const visible = new Set(payload.groups.flatMap(group => group.entries.flatMap(entry => [entry.kind === "sense-card" ? entry.entryId : entry.crossReferenceId])));
  return matchingEntryIds.every(id => visible.has(id)) && payload.groups.every(group =>
    group.entries.some(entry => matchingEntryIds.includes(entry.kind === "sense-card" ? entry.entryId : entry.crossReferenceId)));
}
