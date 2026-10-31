import { withTrainingDiagnostics } from "@/lib/diagnostics/server";
import { NextRequest } from "next/server";
import { readBoundedJson } from "@/lib/http/readBoundedJson";
import {
  getAuthenticatedSupabase,
  getPlatformServiceSupabase,
  jsonNoStore,
  requirePlatformScope,
} from "@/lib/platform/serverSupabase";
import { parseCurrentTrainingCardRequest } from "@/lib/platform/currentTrainingCardRequest";
import { performPlatformV2Lookup } from "@/lib/platform/platformV2LookupService";
import type { CardTypeId } from "../../../../../../../../packages/shared/types/platform";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
async function handlePOST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party")
    return jsonNoStore({ error: "first_party_required" }, 403);
  if (process.env.NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED !== "true")
    return jsonNoStore({ error: "current_training_card_not_enabled" }, 503);
  const body = await readBoundedJson(request, 4096);
  if ("error" in body)
    return jsonNoStore(
      {
        error:
          body.error === "too_large" ? "request_too_large" : "invalid_request",
      },
      body.error === "too_large" ? 413 : 400,
    );
  const input = parseCurrentTrainingCardRequest(body.body);
  if (!input)
    return jsonNoStore({ error: "invalid_current_training_card_request" }, 400);
  const denied = requirePlatformScope(
    auth,
    input.operation === "acknowledge" ? "platform:write" : "platform:read",
  );
  if (denied) return denied;
  if (input.operation === "acknowledge") {
    const { data, error } = await auth.supabase.rpc(
      "acknowledge_current_training_card_v1",
      {
        p_user_id: auth.user.id,
        p_session_id: input.sessionId,
        p_entry_id: input.entryId,
        p_card_type_id: input.cardTypeId,
        p_content_version: input.sourceVersion,
        p_state_revision: input.stateRevision,
        p_target_id: input.targetId ?? null,
        p_direction: input.direction ?? null,
      },
    );
    if (error) {
      const status =
        error.code === "42501"
          ? 403
          : error.code === "40001"
            ? 409
            : error.code === "22023"
              ? 400
              : 500;
      return jsonNoStore(
        {
          error:
            status === 500
              ? "current_training_card_failed"
              : "current_training_card_unavailable",
        },
        status,
      );
    }
    if (
      !data ||
      typeof data.permitId !== "string" ||
      typeof data.expiresAt !== "string"
    )
      return jsonNoStore(
        { error: "current_training_card_contract_invalid" },
        409,
      );
    return jsonNoStore(data);
  }
  const service = getPlatformServiceSupabase();
  if (service instanceof Response) return service;
  const result = await performPlatformV2Lookup(
    { kind: "authenticated", auth, service },
    {
      entryId: input.entryId,
      cardTypeId: input.cardTypeId as CardTypeId,
      intent: "training-review",
      contentLanguageCode: input.contentLanguageCode,
      translationTargetLanguageCode: input.translationTargetLanguageCode,
    },
    undefined,
    { sessionId: input.sessionId, permitId: input.permitId },
  );
  return jsonNoStore(result.payload, result.status);
}

export const POST = withTrainingDiagnostics("/api/platform/v2/training/current-card", handlePOST);
