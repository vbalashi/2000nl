import { NextRequest } from "next/server";
import { getAuthenticatedSupabase, getPlatformServiceSupabase, jsonNoStore, requirePlatformScope } from "@/lib/platform/serverSupabase";
import { platformV2ActionsEnabled } from "@/lib/platform/platformV2Rollout";
import { parseExerciseChoiceRequest } from "../../../../../../packages/shared/types/exerciseKnownChoice";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest) {
 const auth=await getAuthenticatedSupabase(request); if(auth instanceof Response)return auth;
 const denied=requirePlatformScope(auth,"platform:write"); if(denied)return denied;
 if(auth.principal.authKind!=="first_party")return jsonNoStore({error:"first_party_required"},403);
 if(!platformV2ActionsEnabled())return jsonNoStore({error:"platform_v2_actions_not_enabled"},503);
 const input=parseExerciseChoiceRequest(await request.json().catch(()=>null)); if(!input)return jsonNoStore({error:"invalid_training_known_choice"},400);
 const service=getPlatformServiceSupabase(); if(service instanceof Response)return service;
 const {data,error}=await service.supabase.rpc("set_training_exercise_choice_as_principal_v1",{p_user_id:auth.principal.userId,p_target:input.targetId,p_session_id:input.trainingSessionId,p_known:input.knownDirections,p_revision:input.revision,p_event:input.clientEventId});
 if(error){if(error.message.includes("training_session_superseded"))return jsonNoStore({error:"training_session_superseded"},409);const conflict=["exercise_choice_conflict","known_choice_idempotency_conflict","training_session_superseded","training_exercise_session_member"].some(code=>error.message.includes(code));return jsonNoStore({error:conflict?"training_known_choice_conflict":"training_known_choice_failed"},conflict?409:503);}
 return jsonNoStore(data);
}
