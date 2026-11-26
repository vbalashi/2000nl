import { getAuthenticatedSupabase, jsonNoStore } from "./serverSupabase";
import { consumeAudioRateLimit } from "../audio/audioRateLimit";

export async function readAssistantAccess(request: Request) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party")
    return jsonNoStore({ error: "first_party_required" }, 403);
  const { data: tier, error } = await auth.supabase.rpc("get_user_tier", { p_user_id: auth.user.id });
  if (error) return jsonNoStore({ error: "assistant_access_unavailable" }, 503);
  return { auth, allowed: tier === "premium" };
}

export async function requireAssistantAccess(request: Request) {
  const access = await readAssistantAccess(request);
  if (access instanceof Response) return access;
  if (!access.allowed)
    return jsonNoStore({ error: "assistant_access_required" }, 403);
  const rate = consumeAudioRateLimit("personal-assistant:" + access.auth.user.id);
  if (!rate.allowed) return jsonNoStore({ error: "rate_limited", retryAfterMs: rate.retryAfterMs }, 429);
  return access.auth;
}
