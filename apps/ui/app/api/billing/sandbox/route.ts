import { readSandboxCatalog } from "@/lib/billing/sandboxCatalog";
import { readSandboxTransactionConfig } from "@/lib/billing/sandboxTransactions";
import { getAuthenticatedUserSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";

export async function GET(request: Request) {
  const catalog = readSandboxCatalog(process.env);
  if (!catalog) return jsonNoStore({ error: "checkout_unavailable" }, 404);

  const auth = await getAuthenticatedUserSupabase(request);
  if (auth instanceof Response) return auth;
  return jsonNoStore({ ...catalog, checkoutReady: Boolean(readSandboxTransactionConfig(process.env)) });
}
