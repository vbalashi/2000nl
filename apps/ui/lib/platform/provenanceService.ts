import type { AuthenticatedSupabase } from "./serverSupabase";
import type { ReviewResult, TrainingMode } from "@/lib/types";

export async function recordReview(auth: AuthenticatedSupabase, params: {
  entryId: string;
  mode: TrainingMode;
  result: ReviewResult;
  turnId?: string | null;
}) {
  return auth.supabase.rpc("handle_card_review", {
    p_user_id: auth.user.id,
    p_entry_id: params.entryId,
    p_card_type_id: params.mode,
    p_result: params.result,
    p_turn_id: params.turnId ?? null,
  });
}

export async function performProvenanceAwareCardAction(
  auth: AuthenticatedSupabase,
  params: {
    entryId: string;
    mode: TrainingMode;
    action:
      | "record-view"
      | "start-learning"
      | "mark-known"
      | "mark-unknown"
      | "review-card";
    result?: ReviewResult | null;
    turnId?: string | null;
    clientEventId: string;
    sourceContext?: Record<string, unknown> | null;
  },
) {
  return auth.supabase.rpc("perform_platform_card_action", {
    p_user_id: auth.user.id,
    p_entry_id: params.entryId,
    p_card_type_id: params.mode,
    p_action: params.action,
    p_result: params.result ?? null,
    p_turn_id: params.turnId ?? null,
    p_client_event_id: params.clientEventId,
    p_source_context: params.sourceContext ?? null,
    p_auth_kind: auth.principal.authKind,
    p_connected_client_id: auth.principal.connectedClientId,
  });
}
