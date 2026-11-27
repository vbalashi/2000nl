import { readSandboxCatalog } from "@/lib/billing/sandboxCatalog";
import { readSandboxWebhookConfig, sandboxFulfillmentEnabled } from "@/lib/billing/paddleSandboxWebhook";
import { readSandboxTransactionConfig } from "@/lib/billing/sandboxTransactions";
import { getAuthenticatedUserSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";

export async function GET(request: Request) {
  const catalog = readSandboxCatalog(process.env);
  if (!catalog) return jsonNoStore({ error: "checkout_unavailable" }, 404);

  const auth = await getAuthenticatedUserSupabase(request);
  if (auth instanceof Response) return auth;
  const fulfillment = sandboxFulfillmentEnabled(process.env);
  const checkoutReady = Boolean(readSandboxTransactionConfig(process.env)) &&
    (!fulfillment || Boolean(readSandboxWebhookConfig(process.env)));
  return jsonNoStore({ ...catalog, checkoutReady, fulfillment });
}
