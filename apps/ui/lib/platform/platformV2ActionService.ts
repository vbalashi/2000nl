import type {
  PlatformActionV2Request,
  PlatformActionV2Response,
  PlatformSenseCardStateV2,
} from "../../../../packages/shared/types/platformV2";
import type {
  AuthenticatedSupabase,
  ServiceSupabase,
} from "./serverSupabase";

export type PlatformV2ActionOperationResult = {
  payload: unknown;
  status: number;
};

export async function performPlatformV2Action(
  auth: AuthenticatedSupabase,
  service: ServiceSupabase,
  request: PlatformActionV2Request,
): Promise<PlatformV2ActionOperationResult> {
  const undoTarget =
    request.actionId === "undo-known" ? request.target : null;
  const reviewResult =
    request.actionId === "review-card" ? request.reviewResult : null;
  const { data, error } = await service.supabase.rpc(
    "perform_platform_v2_card_action",
    {
      p_user_id: auth.user.id,
      p_action_id: request.actionId,
      p_entry_id: request.target.entryId,
      p_card_type_id: request.target.cardTypeId,
      p_state_revision: request.target.stateRevision,
      p_active_known_mark_id: undoTarget?.activeKnownMarkId ?? null,
      p_known_mark_revision: undoTarget?.knownMarkRevision ?? null,
      p_review_result: reviewResult,
      p_client_event_id: request.clientEventId,
      p_source_context: request.sourceContext ?? null,
      p_auth_kind: auth.principal.authKind,
      p_connected_client_id: auth.principal.connectedClientId,
    },
  );

  if (error) return actionError(error);
  const result = asRecord(data);
  const card = platformCardState(result.card, request.target.cardTypeId);
  if (
    (result.status !== "accepted" && result.status !== "duplicate") ||
    result.actionId !== request.actionId ||
    result.clientEventId !== request.clientEventId ||
    !card
  ) {
    return {
      payload: { error: "invalid_platform_v2_action_response" },
      status: 500,
    };
  }

  const payload: PlatformActionV2Response = {
    contractVersion: "platform-action-v2",
    actionId: request.actionId,
    clientEventId: request.clientEventId,
    accepted: true,
    card,
  };
  return { payload, status: 200 };
}

function actionError(error: unknown): PlatformV2ActionOperationResult {
  const message = errorMessage(error);
  if (message.includes("platform_action_idempotency_conflict")) {
    return { payload: { error: "idempotency_conflict" }, status: 409 };
  }
  if (message.includes("platform_card_state_conflict")) {
    return { payload: { error: "state_conflict" }, status: 409 };
  }
  if (message.includes("platform_known_mark_conflict")) {
    return { payload: { error: "known_mark_conflict" }, status: 409 };
  }
  if (message.includes("platform_card_already_known")) {
    return { payload: { error: "card_already_known" }, status: 409 };
  }
  if (message.includes("platform_action_not_available")) {
    return { payload: { error: "action_not_available" }, status: 409 };
  }
  if (message.includes("card_is_known")) {
    return { payload: { error: "card_is_known" }, status: 409 };
  }
  if (message.includes("entry_not_found")) {
    return { payload: { error: "entry_not_found" }, status: 404 };
  }
  if (message.includes("entry_not_accessible")) {
    return { payload: { error: "entry_not_accessible" }, status: 403 };
  }
  if (message.includes("invalid_connected_client_grant")) {
    return {
      payload: { error: "invalid_connected_client_grant" },
      status: 403,
    };
  }
  return {
    payload: { error: "platform_v2_action_failed" },
    status: 500,
  };
}

function platformCardState(
  value: unknown,
  expectedCardTypeId: string,
): PlatformSenseCardStateV2 | null {
  const card = asRecord(value);
  const scheduler = asRecord(card.scheduler);
  const phase = scheduler.phase;
  const stateRevision = asString(card.stateRevision);
  if (
    card.cardTypeId !== expectedCardTypeId ||
    !stateRevision ||
    (phase !== "not-started" &&
      phase !== "encountered" &&
      phase !== "learning" &&
      phase !== "reviewing" &&
      phase !== "hidden" &&
      phase !== "frozen")
  ) {
    return null;
  }

  const knownMark = platformKnownMark(card.knownMark);
  if (card.knownMark !== null && !knownMark) return null;

  return {
    cardTypeId: expectedCardTypeId as PlatformSenseCardStateV2["cardTypeId"],
    scheduler: {
      phase,
      ...(typeof scheduler.repeatCount === "number"
        ? { repeatCount: scheduler.repeatCount }
        : {}),
      ...(scheduler.lastSeenAt === null ||
      typeof scheduler.lastSeenAt === "string"
        ? { lastSeenAt: scheduler.lastSeenAt as string | null }
        : {}),
      ...(typeof scheduler.frozenUntil === "string"
        ? { frozenUntil: scheduler.frozenUntil }
        : {}),
    },
    knownMark,
    stateRevision,
  };
}

function platformKnownMark(
  value: unknown,
): PlatformSenseCardStateV2["knownMark"] {
  if (value === null) return null;
  const mark = asRecord(value);
  const markId = asString(mark.markId);
  const revision = asString(mark.revision);
  const markedAt = asString(mark.markedAt);
  return markId && revision && markedAt
    ? { markId, revision, markedAt }
    : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function errorMessage(value: unknown) {
  const record = asRecord(value);
  return typeof record.message === "string"
    ? record.message
    : String(value);
}
