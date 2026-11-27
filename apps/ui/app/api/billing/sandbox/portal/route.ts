import { getAuthenticatedUserSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";
import { readSandboxBillingAccess } from "@/lib/billing/paddleSandboxAccess";
import { createPaddleSandboxPortalLink, isPortalAction, sandboxPortalKey } from "@/lib/billing/paddleSandboxPortal";
import { sandboxFulfillmentEnabled } from "@/lib/billing/paddleSandboxWebhook";

export async function POST(request: Request) {
  const key = sandboxPortalKey(process.env);
  if (!sandboxFulfillmentEnabled(process.env) || !key) return jsonNoStore({ error: "sandbox_portal_disabled" }, 404);
  const auth = await getAuthenticatedUserSupabase(request);
  if (auth instanceof Response) return auth;
  const body = await request.json().catch(() => null);
  if (!isPortalAction(body?.action)) return jsonNoStore({ error: "invalid_portal_action" }, 400);
  try {
    const { subscriptionId } = await readSandboxBillingAccess(auth.supabase);
    if (!subscriptionId) return jsonNoStore({ error: "sandbox_subscription_unavailable" }, 404);
    const url = await createPaddleSandboxPortalLink(key, subscriptionId, body.action);
    if (!url) return jsonNoStore({ error: "sandbox_portal_action_unavailable" }, 409);
    const response = jsonNoStore({ url });
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return jsonNoStore({ error: "sandbox_portal_unavailable" }, 503);
  }
}
