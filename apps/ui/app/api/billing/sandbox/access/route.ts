import { getAuthenticatedUserSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";
import { readSandboxAccess, readSandboxPortalUrl } from "@/lib/billing/paddleSandboxAccess";
import { sandboxFulfillmentEnabled } from "@/lib/billing/paddleSandboxWebhook";

export async function GET(request: Request) {
  if (!sandboxFulfillmentEnabled(process.env)) return jsonNoStore({ error: "sandbox_access_disabled" }, 404);
  const auth = await getAuthenticatedUserSupabase(request);
  if (auth instanceof Response) return auth;
  try {
    return jsonNoStore({
      access: await readSandboxAccess(auth.supabase),
      portalUrl: readSandboxPortalUrl(process.env.PADDLE_SANDBOX_CUSTOMER_PORTAL_URL),
    });
  } catch {
    return jsonNoStore({ error: "sandbox_access_unavailable" }, 503);
  }
}
