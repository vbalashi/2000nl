import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";
import type { SandboxCatalog } from "./sandboxCatalog";

export async function fetchSandboxCatalog(signal: AbortSignal): Promise<SandboxCatalog & { checkoutReady: boolean }> {
  const headers = await authenticatedJsonHeaders();
  const response = await fetch("/api/billing/sandbox", { headers, signal, cache: "no-store" });
  if (!response.ok) throw new Error("checkout_unavailable");
  return response.json();
}
