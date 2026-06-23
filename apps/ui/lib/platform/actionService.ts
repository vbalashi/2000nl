import type { AuthenticatedSupabase } from "./serverSupabase";
import { parseSourceContext } from "./sourceContext";
import type { PlatformAction, PlatformActionBody, PlatformOperationResult } from "./platformApi";

const SUPPORTED_PLATFORM_ACTIONS: PlatformAction[] = [
  "fetch-entry",
  "record-view",
  "review-card",
  "mark-known",
  "mark-unknown",
  "start-learning",
  "add-to-list",
  "remove-from-list",
  "copy-to-user-dictionary",
  "create-user-entry",
  "update-user-entry",
  "delete-user-entry",
  "create-user-list",
  "update-user-list",
  "delete-user-list",
];

type ValidatedPlatformAction = {
  action: PlatformAction;
  entryId: string | null;
  clientEventId: string | null;
  sourceContext: Record<string, unknown> | null;
  sourceContextVersion: "none" | "legacy" | "v1" | "v2";
};

export function validatePlatformActionEnvelope(
  auth: AuthenticatedSupabase,
  body: PlatformActionBody | null,
): { ok: true; value: ValidatedPlatformAction } | { ok: false; result: PlatformOperationResult } {
  const action = asString(body?.action) as PlatformAction | null;
  const entryId = asString(body?.entryId);
  const clientEventId = asClientEventId(body?.clientEventId);
  const parsedSourceContext = parseSourceContext(body?.sourceContext, auth.user.id);
  const sourceContext = parsedSourceContext.ok ? parsedSourceContext.value : null;
  const sourceContextVersion = parsedSourceContext.ok ? parsedSourceContext.version : "none";

  if (!action) {
    return { ok: false, result: { payload: { error: "missing_action" }, status: 400 } };
  }
  if (!SUPPORTED_PLATFORM_ACTIONS.includes(action)) {
    return { ok: false, result: { payload: { error: "unsupported_action" }, status: 400 } };
  }
  if (body?.clientEventId !== undefined && !clientEventId) {
    return { ok: false, result: { payload: { error: "invalid_client_event_id" }, status: 400 } };
  }
  if (!parsedSourceContext.ok) {
    return {
      ok: false,
      result: {
        payload: { error: parsedSourceContext.error },
        status: parsedSourceContext.status,
      },
    };
  }
  if (sourceContext && !clientEventId) {
    return { ok: false, result: { payload: { error: "missing_client_event_id" }, status: 400 } };
  }
  if (
    sourceContextVersion === "v2" &&
    (action === "review-card" || action === "mark-known" || action === "mark-unknown")
  ) {
    const eventUuid = asUuid(clientEventId);
    const explicitTurnUuid = body?.turnId === undefined ? null : asUuid(body.turnId);
    if (!eventUuid) {
      return {
        ok: false,
        result: { payload: { error: "v2_client_event_id_must_be_uuid" }, status: 400 },
      };
    }
    if (body?.turnId !== undefined && explicitTurnUuid !== eventUuid) {
      return { ok: false, result: { payload: { error: "v2_turn_id_mismatch" }, status: 400 } };
    }
  }
  if (auth.principal.authKind === "connected_client") {
    const reportedClientId = sourceContextClientId(sourceContext);
    if (
      reportedClientId &&
      reportedClientId !== auth.principal.connectedClientId
    ) {
      return {
        ok: false,
        result: {
          payload: {
            error: "client_identity_mismatch",
            detail: "sourceContext.client.id must match the authenticated Connected Client.",
          },
          status: 403,
        },
      };
    }
  }

  return {
    ok: true,
    value: {
      action,
      entryId,
      clientEventId,
      sourceContext,
      sourceContextVersion,
    },
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asClientEventId(value: unknown): string | null {
  const eventId = asString(value);
  return eventId && /^[A-Za-z0-9._:-]{1,128}$/.test(eventId) ? eventId : null;
}

function asUuid(value: unknown): string | null {
  const uuid = asString(value);
  return uuid &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)
    ? uuid
    : null;
}

function sourceContextClientId(sourceContext: Record<string, unknown> | null) {
  const client = asRecord(sourceContext?.client);
  return asString(client?.id);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
