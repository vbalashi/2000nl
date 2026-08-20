import type { PlatformActionV2Request } from "../../../../packages/shared/types/platformV2";
import { isPlatformCardTypeId } from "./cardTypeRegistry";
import type { AuthenticatedSupabase } from "./serverSupabase";
import { parseSourceContext } from "./sourceContext";

export function parsePlatformV2ActionRequest(
  auth: AuthenticatedSupabase,
  value: unknown,
):
  | { ok: true; request: PlatformActionV2Request }
  | { ok: false; error: string; status: number } {
  const body = asRecord(value);
  const actionId = asString(body.actionId);
  if (
    actionId !== "start-learning" &&
    actionId !== "mark-known" &&
    actionId !== "undo-known" &&
    actionId !== "review-card"
  ) {
    return { ok: false, error: "unsupported_action", status: 400 };
  }

  const clientEventId = asUuid(body.clientEventId);
  if (!clientEventId) {
    return { ok: false, error: "invalid_client_event_id", status: 400 };
  }

  const target = asRecord(body.target);
  if (target.kind !== "sense-card") {
    return { ok: false, error: "invalid_action_target", status: 400 };
  }
  const entryId = asUuid(target.entryId);
  const cardTypeId = asString(target.cardTypeId);
  const stateRevision = asString(target.stateRevision);
  if (!entryId) {
    return { ok: false, error: "invalid_entry_id", status: 400 };
  }
  if (!cardTypeId || !isPlatformCardTypeId(cardTypeId)) {
    return { ok: false, error: "unsupported_card_type_id", status: 400 };
  }
  if (
    !stateRevision ||
    (stateRevision !== "untracked" && !asUuid(stateRevision))
  ) {
    return { ok: false, error: "invalid_state_revision", status: 400 };
  }

  const parsedSourceContext = parseSourceContext(
    body.sourceContext,
    auth.user.id,
  );
  if (!parsedSourceContext.ok) {
    return parsedSourceContext;
  }
  if (parsedSourceContext.version === "v1") {
    return {
      ok: false,
      error: "invalid_source_context_version",
      status: 400,
    };
  }
  if (auth.principal.authKind === "connected_client") {
    const rawClientId = asString(
      asRecord(asRecord(body.sourceContext).client).id,
    );
    if (
      rawClientId &&
      rawClientId !== auth.principal.connectedClientId
    ) {
      return { ok: false, error: "client_identity_mismatch", status: 403 };
    }
  }

  const sourceContext =
    (parsedSourceContext.value as PlatformActionV2Request["sourceContext"]) ??
    undefined;
  const senseCardTarget = {
    kind: "sense-card" as const,
    entryId,
    cardTypeId,
    stateRevision,
  };

  if (actionId === "undo-known") {
    if (body.reviewResult !== undefined) {
      return {
        ok: false,
        error: "unexpected_review_result",
        status: 400,
      };
    }
    const activeKnownMarkId = asUuid(target.activeKnownMarkId);
    const knownMarkRevision = asUuid(target.knownMarkRevision);
    if (!activeKnownMarkId || !knownMarkRevision) {
      return { ok: false, error: "invalid_known_mark_target", status: 400 };
    }
    return {
      ok: true,
      request: {
        actionId,
        clientEventId,
        target: {
          ...senseCardTarget,
          activeKnownMarkId,
          knownMarkRevision,
        },
        ...(sourceContext ? { sourceContext } : {}),
      },
    };
  }

  if (actionId === "review-card") {
    if (
      target.activeKnownMarkId !== undefined ||
      target.knownMarkRevision !== undefined
    ) {
      return {
        ok: false,
        error: "unexpected_known_mark_target",
        status: 400,
      };
    }
    const reviewResult = asString(body.reviewResult);
    if (
      reviewResult !== "fail" &&
      reviewResult !== "hard" &&
      reviewResult !== "success" &&
      reviewResult !== "easy"
    ) {
      return { ok: false, error: "invalid_review_result", status: 400 };
    }
    return {
      ok: true,
      request: {
        actionId,
        clientEventId,
        target: senseCardTarget,
        reviewResult,
        ...(sourceContext ? { sourceContext } : {}),
      },
    };
  }

  if (body.reviewResult !== undefined) {
    return { ok: false, error: "unexpected_review_result", status: 400 };
  }
  if (
    target.activeKnownMarkId !== undefined ||
    target.knownMarkRevision !== undefined
  ) {
    return {
      ok: false,
      error: "unexpected_known_mark_target",
      status: 400,
    };
  }

  return {
    ok: true,
    request: {
      actionId,
      clientEventId,
      target: senseCardTarget,
      ...(sourceContext ? { sourceContext } : {}),
    },
  };
}

export function parsePlatformV2ActionReceiptRequest(value: unknown):
  | { ok: true; clientEventId: string }
  | { ok: false; error: string; status: number } {
  const clientEventId = asUuid(asRecord(value).clientEventId);
  return clientEventId
    ? { ok: true, clientEventId }
    : { ok: false, error: "invalid_client_event_id", status: 400 };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asUuid(value: unknown): string | null {
  const text = asString(value);
  return text &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      text,
    )
    ? text
    : null;
}
