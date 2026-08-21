import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";
import {
  DEFAULT_PLATFORM_FETCH_TIMEOUT_MS,
  platformFetchWithTimeout,
} from "./platformFetchWithTimeout";
import {
  recordTrainingTransitionResponse,
  recordTrainingTransitionTiming,
} from "../training/trainingTransitionTiming";
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

const PROGRESS_ACTION_AUTHORITATIVE_REQUEST_COUNT = 2;
// Bounds auth/session acquisition, client scheduling between attempts and
// response JSON parsing while still fitting inside a fresh 30s prefetch lease.
export const PLATFORM_V2_PROGRESS_ACTION_LEASE_SAFETY_MARGIN_MS = 4_000;
export const PLATFORM_V2_PROGRESS_ACTION_LEASE_WINDOW_MS =
  DEFAULT_PLATFORM_FETCH_TIMEOUT_MS *
    PROGRESS_ACTION_AUTHORITATIVE_REQUEST_COUNT +
  PLATFORM_V2_PROGRESS_ACTION_LEASE_SAFETY_MARGIN_MS;

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
  context: {
    transitionId?: string;
    onRequestFrozen?: (request: PlatformActionV2Request) => void;
  } = {},
): Promise<PlatformActionV2Response> {
  const request = buildPlatformV2TrainingActionRequest(
    capability,
    crypto.randomUUID(),
  );
  context.onRequestFrozen?.(structuredClone(request));
  const headers = await platformV2AuthenticatedJsonHeaders();
  let response: Response;
  try {
    response = await submitPlatformV2TrainingAction(
      request,
      headers,
      context.transitionId,
    );
  } catch (error) {
    if (!isAmbiguousTransportError(error)) throw error;
    response = await reconcilePlatformV2TrainingAction(
      request.clientEventId,
      headers,
      context.transitionId,
    );
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
  transitionId?: string,
) {
  const correlatedHeaders = Object.fromEntries(new Headers(headers).entries());
  return timedActionRequest(
    transitionId,
    "review.mutation.request",
    "attempt-1",
    () =>
      platformFetchWithTimeout("/api/platform/v2/actions", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          ...correlatedHeaders,
          "x-platform-action-attempt": "1",
        },
        body: JSON.stringify(request),
      }),
  );
}

function reconcilePlatformV2TrainingAction(
  clientEventId: string,
  headers: HeadersInit,
  transitionId?: string,
) {
  return timedActionRequest(
    transitionId,
    "review.reconciliation.request",
    "reconcile",
    () =>
      platformFetchWithTimeout("/api/platform/v2/actions/reconcile", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers,
        body: JSON.stringify({ clientEventId }),
      }),
  );
}

async function timedActionRequest(
  transitionId: string | undefined,
  stage: "review.mutation.request" | "review.reconciliation.request",
  outcomePrefix: string,
  request: () => Promise<Response>,
) {
  if (!transitionId) return request();
  const startedAt = performance.now();
  try {
    const response = await request();
    recordTrainingTransitionResponse(
      transitionId,
      stage,
      startedAt,
      response,
      `${outcomePrefix}-http-${response.status}`,
    );
    return response;
  } catch (error) {
    recordTrainingTransitionTiming({
      transitionId,
      stage,
      durationMs: performance.now() - startedAt,
      outcome: `${outcomePrefix}-transport-error`,
    });
    throw error;
  }
}

function isAmbiguousTransportError(error: unknown) {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message === "Failed to fetch" || message === "platform_request_timeout";
}
