import { readSandboxCatalog } from "@/lib/billing/sandboxCatalog";
import { getAuthenticatedSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";

export async function GET(request: Request) {
  const catalog = readSandboxCatalog(process.env);
  if (!catalog) return jsonNoStore({ error: "checkout_unavailable" }, 404);

  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party") return jsonNoStore({ error: "first_party_required" }, 403);
  return jsonNoStore(catalog);
}
