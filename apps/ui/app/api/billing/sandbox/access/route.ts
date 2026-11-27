import { getAuthenticatedUserSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";
import { readSandboxBillingAccess } from "@/lib/billing/paddleSandboxAccess";
import { readPaddleSandboxSubscription, sandboxPortalKey } from "@/lib/billing/paddleSandboxPortal";
import { sandboxFulfillmentEnabled } from "@/lib/billing/paddleSandboxWebhook";

export async function GET(request: Request) {
  if (!sandboxFulfillmentEnabled(process.env)) return jsonNoStore({ error: "sandbox_access_disabled" }, 404);
  const auth = await getAuthenticatedUserSupabase(request);
  if (auth instanceof Response) return auth;
  try {
    const { access, subscriptionId } = await readSandboxBillingAccess(auth.supabase);
    const key = sandboxPortalKey(process.env);
    const subscription = key && subscriptionId
      ? await readPaddleSandboxSubscription(key, subscriptionId).catch(() => null)
      : null;
    return jsonNoStore({
      access,
      nextPaymentAt: subscription?.nextPaymentAt ?? null,
      cancelAt: subscription?.cancelAt ?? null,
      pastDue: subscription?.pastDue ?? false,
      actions: {
        details: Boolean(key && subscriptionId),
        payment: subscription?.paymentEditable ?? (access.active && Boolean(key && subscriptionId)),
        cancel: subscription?.canCancel ?? (access.active && !access.endsAfterCancel && Boolean(key && subscriptionId)),
      },
    });
  } catch {
    return jsonNoStore({ error: "sandbox_access_unavailable" }, 503);
  }
}
