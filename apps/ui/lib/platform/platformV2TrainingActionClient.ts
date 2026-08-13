import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";
import { platformFetchWithTimeout } from "./platformFetchWithTimeout";
import type {
  PlatformActionV2Request,
  PlatformActionV2Response,
  PlatformSenseCardCapabilityV2,
} from "../../../../packages/shared/types/platformV2";

export type PlatformV2TrainingActionCapability =
  PlatformSenseCardCapabilityV2 & {
    actionId:
      | "start-learning"
      | "mark-known"
      | "undo-known"
      | "review-card";
  };

export function isPlatformV2TrainingActionCapability(
  capability: PlatformSenseCardCapabilityV2,
): capability is PlatformV2TrainingActionCapability {
  return (
    capability.actionId === "start-learning" ||
    capability.actionId === "mark-known" ||
    capability.actionId === "undo-known" ||
    capability.actionId === "review-card"
  );
}

export function buildPlatformV2TrainingActionRequest(
  capability: PlatformV2TrainingActionCapability,
  clientEventId: string,
): PlatformActionV2Request {
  if (capability.actionId === "review-card") {
    return {
      actionId: capability.actionId,
      clientEventId,
      target: capability.target,
      reviewResult: capability.reviewResult,
    };
  }
  if (capability.actionId === "undo-known") {
    return {
      actionId: capability.actionId,
      clientEventId,
      target: capability.target,
    };
  }
  return {
    actionId: capability.actionId,
    clientEventId,
    target: capability.target,
  };
}

export async function performPlatformV2TrainingAction(
  capability: PlatformV2TrainingActionCapability,
): Promise<PlatformActionV2Response> {
  const request = buildPlatformV2TrainingActionRequest(
    capability,
    crypto.randomUUID(),
  );
  const headers = await platformV2AuthenticatedJsonHeaders();
  let response: Response;
  try {
    response = await submitPlatformV2TrainingAction(request, headers, 1);
  } catch (error) {
    if (
      capability.actionId !== "review-card" ||
      !isAmbiguousTransportError(error)
    ) {
      throw error;
    }
    try {
      response = await submitPlatformV2TrainingAction(request, headers, 2);
    } catch (retryError) {
      if (!isAmbiguousTransportError(retryError)) throw retryError;
      response = await reconcilePlatformV2TrainingAction(
        request.clientEventId,
        headers,
      );
    }
  }
  const payload = (await response.json()) as
    | PlatformActionV2Response
    | { error?: string };
  if (
    !response.ok ||
    !("contractVersion" in payload) ||
    payload.contractVersion !== "platform-action-v2" ||
    !payload.accepted
  ) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "platform_v2_action_failed",
    );
  }
  return payload;
}

function submitPlatformV2TrainingAction(
  request: PlatformActionV2Request,
  headers: HeadersInit,
  attempt: 1 | 2,
) {
  const correlatedHeaders = Object.fromEntries(new Headers(headers).entries());
  return platformFetchWithTimeout("/api/platform/v2/actions", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...correlatedHeaders,
      "x-platform-action-attempt": String(attempt),
    },
    body: JSON.stringify(request),
  });
}

function reconcilePlatformV2TrainingAction(
  clientEventId: string,
  headers: HeadersInit,
) {
  return platformFetchWithTimeout("/api/platform/v2/actions/reconcile", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers,
    body: JSON.stringify({ clientEventId }),
  });
}

function isAmbiguousTransportError(error: unknown) {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message === "Failed to fetch" || message === "platform_request_timeout";
}
