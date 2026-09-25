import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  getPlatformServiceSupabase,
  jsonNoStore,
  platformCorsPreflight,
  requirePlatformScope,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import { parseTrainingExclusionRequest } from "@/lib/platform/trainingExclusionRequest";
import { platformV2ActionsEnabled } from "@/lib/platform/platformV2Rollout";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}
export async function POST(request: NextRequest) {
  const reply = (value: unknown, status = 200) =>
    withPlatformCors(request, jsonNoStore(value, status));
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return withPlatformCors(request, auth);
  const denied = requirePlatformScope(auth, "platform:write");
  if (denied) return withPlatformCors(request, denied);
  if (auth.principal.authKind !== "first_party")
    return reply({ error: "training_exclusions_first_party_only" }, 403);
  if (!platformV2ActionsEnabled())
    return reply({ error: "platform_v2_actions_not_enabled" }, 503);
  const input = parseTrainingExclusionRequest(
    await request.json().catch(() => null),
  );
  if (!input)
    return reply({ error: "invalid_training_exclusion_request" }, 400);
  const service = getPlatformServiceSupabase();
  if (service instanceof Response) return withPlatformCors(request, service);
  const { data, error } = await service.supabase.rpc(
    "perform_training_pair_exclusion_as_principal_v1",
    {
      p_user_id: auth.principal.userId,
      p_action: input.actionId,
      p_client_event_id: input.clientEventId,
      p_entry_id: input.target.kind === "meaning" ? input.target.entryId : null,
      p_card_type_id:
        input.target.kind === "meaning" ? input.target.cardTypeId : null,
      p_exercise_target_id:
        input.target.kind === "exercise" ? input.target.targetId : null,
      p_session_id:
        input.actionId === "exclude-pair" ? input.trainingSessionId : null,
      p_exclusion_id:
        input.actionId === "restore-pair" ? input.exclusionId : null,
    },
  );
  if (error) {
    const expected = [
      "training_session_superseded",
      "training_session_member_unavailable",
      "training_exercise_session_member_unavailable",
      "training_exercise_session_member_out_of_order",
      "training_exercise_session_member_already_consumed",
      "training_exercise_session_completed",
      "training_pair_already_excluded",
      "stale_exclusion_mark",
      "exclusion_idempotency_conflict",
    ];
    const code = expected.find((code) => error.message.includes(code));
    return reply(
      { error: code ?? "training_exclusion_failed" },
      code ? 409 : 500,
    );
  }
  return reply(data);
}
