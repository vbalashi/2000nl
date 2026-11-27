import { sandboxSubscriptionId } from "./paddleSandboxAccess";
import { paddleSandboxRequest } from "./sandboxTransactions";

export type PortalAction = "details" | "payment" | "cancel";

export function isPortalAction(value: unknown): value is PortalAction {
  return value === "details" || value === "payment" || value === "cancel";
}

export function sandboxPortalKey(env: Readonly<Record<string, string | undefined>>) {
  const key = env.PADDLE_SANDBOX_PORTAL_API_KEY;
  return key && /^pdl_sdbx_apikey_[a-zA-Z0-9_]+$/.test(key) ? key : null;
}

function providerDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export async function readPaddleSandboxSubscription(key: string, subscriptionId: string) {
  if (!sandboxSubscriptionId.test(subscriptionId)) throw new Error("sandbox_subscription_invalid");
  const data = await paddleSandboxRequest(key, "/subscriptions/" + subscriptionId);
  if (data?.id !== subscriptionId || typeof data.customer_id !== "string" || !/^ctm_[a-z0-9]{26}$/.test(data.customer_id)) {
    throw new Error("sandbox_subscription_unavailable");
  }
  const recurring = ["active", "trialing", "past_due"].includes(data.status);
  const scheduledCancel = data.scheduled_change?.action === "cancel";
  return {
    customerId: data.customer_id as string,
    nextPaymentAt: recurring && !scheduledCancel ? providerDate(data.next_billed_at) : null,
    cancelAt: scheduledCancel ? providerDate(data.scheduled_change.effective_at) : null,
    pastDue: data.status === "past_due",
    paymentEditable: recurring,
    canCancel: recurring && !scheduledCancel,
  };
}

function validatedPortalUrl(value: unknown) {
  if (typeof value !== "string") throw new Error("sandbox_portal_link_missing");
  const url = new URL(value);
  if (url.origin !== "https://sandbox-customer-portal.paddle.com" || url.username || url.password ||
    url.hash || !/^\/cpl_[a-z0-9]{26}$/.test(url.pathname) || !url.searchParams.get("token")) {
    throw new Error("sandbox_portal_link_invalid");
  }
  return url.href;
}

export async function createPaddleSandboxPortalLink(key: string, subscriptionId: string, action: PortalAction) {
  const subscription = await readPaddleSandboxSubscription(key, subscriptionId);
  if ((action === "payment" && !subscription.paymentEditable) || (action === "cancel" && !subscription.canCancel)) return null;
  const data = await paddleSandboxRequest(key, "/customers/" + subscription.customerId + "/portal-sessions", {
    subscription_ids: [subscriptionId],
  });
  if (data?.customer_id !== subscription.customerId) throw new Error("sandbox_portal_customer_mismatch");
  const links = Array.isArray(data.urls?.subscriptions)
    ? data.urls.subscriptions.find((entry: { id?: string } | null) => entry?.id === subscriptionId)
    : null;
  if (action === "details") return validatedPortalUrl(links?.view_subscription ?? data.urls?.general?.overview);
  return validatedPortalUrl(action === "payment" ? links?.update_subscription_payment_method : links?.cancel_subscription);
}
