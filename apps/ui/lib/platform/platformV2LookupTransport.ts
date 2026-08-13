import type {
  PlatformLookupV2Request,
  PlatformLookupV2Response,
} from "../../../../packages/shared/types/platformV2";
import { platformFetchWithTimeout } from "./platformFetchWithTimeout";
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
  const response = await platformFetchWithTimeout(
    "/api/platform/v2/lookup",
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: input.signal,
      headers: await platformV2AuthenticatedJsonHeaders(),
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
}

function isPlatformLookupV2Response(
  value: unknown,
): value is PlatformLookupV2Response {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlatformLookupV2Response>;
  return (
    candidate.contractVersion === "platform-lookup-v2" &&
    typeof candidate.query === "string" &&
    Boolean(candidate.request && typeof candidate.request === "object") &&
    Array.isArray(candidate.groups) &&
    Boolean(
      candidate.page &&
        typeof candidate.page === "object" &&
        typeof candidate.page.selectedTierComplete === "boolean" &&
        (candidate.page.nextGroupCursor === null ||
          typeof candidate.page.nextGroupCursor === "string"),
    )
  );
}
