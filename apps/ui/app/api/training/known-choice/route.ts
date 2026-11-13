import { NextRequest } from "next/server";
import { withTrainingDiagnostics } from "@/lib/diagnostics/server";
import { getAuthenticatedSupabase, getPlatformServiceSupabase, jsonNoStore, requirePlatformScope } from "@/lib/platform/serverSupabase";
import { platformV2ActionsEnabled } from "@/lib/platform/platformV2Rollout";
import { parseTrainingKnownChoiceRequest } from "../../../../../../packages/shared/types/trainingKnownChoice";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
async function handlePOST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  const denied = requirePlatformScope(auth, "platform:write");
  if (denied) return denied;
  if (auth.principal.authKind !== "first_party") return jsonNoStore({ error: "first_party_required" }, 403);
  if (!platformV2ActionsEnabled()) return jsonNoStore({ error: "platform_v2_actions_not_enabled" }, 503);
  const input = parseTrainingKnownChoiceRequest(await request.json().catch(() => null));
  if (!input) return jsonNoStore({ error: "invalid_training_known_choice" }, 400);
  const service = getPlatformServiceSupabase();
  if (service instanceof Response) return service;
  const { data, error } = await service.supabase.rpc("set_training_known_directions_as_principal_v1", {
    p_user_id: auth.principal.userId, p_entry_id: input.entryId, p_session_id: input.trainingSessionId,
    p_current_direction: input.currentDirection, p_known_directions: input.knownDirections,
    p_expected_revision: input.revision, p_client_event_id: input.clientEventId,
  });
  if (error) {
    const conflict = ["meaning_progress_conflict", "known_choice_idempotency_conflict", "training_session_superseded", "training_session_member_unavailable", "entry_not_accessible"].find(code => error.message.includes(code));
    return jsonNoStore({ error: conflict ?? "training_known_choice_failed" }, conflict ? 409 : 503);
  }
  return jsonNoStore(data);
}
export const POST = withTrainingDiagnostics("/api/training/known-choice", handlePOST);
