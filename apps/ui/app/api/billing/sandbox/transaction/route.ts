import { getAuthenticatedUserSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";
import { createSandboxTransaction, isSandboxPlan, readSandboxTransaction, readSandboxTransactionConfig } from "@/lib/billing/sandboxTransactions";
import { readSmallJson } from "@/lib/billing/readSmallJson";

export const runtime = "nodejs";

const recentStarts = new Map<string, number>();
const startIntervalMs = 3000;
const maxRecentStarts = 512;

function admitStart(userId: string) {
  const now = Date.now();
  for (const [id, time] of recentStarts) {
    if (time + startIntervalMs <= now) recentStarts.delete(id);
  }
  if (recentStarts.has(userId) || recentStarts.size >= maxRecentStarts) return false;
  recentStarts.set(userId, now);
  return true;
}

export async function POST(request: Request) {
  const config = readSandboxTransactionConfig(process.env);
  if (!config) return jsonNoStore({ error: "checkout_unavailable" }, 404);

  const auth = await getAuthenticatedUserSupabase(request);
  if (auth instanceof Response) return auth;
  const body = await readSmallJson(request);
  if (!body || typeof body !== "object") return jsonNoStore({ error: "invalid_request" }, 400);

  try {
    if ("plan" in body && isSandboxPlan(body.plan) && Object.keys(body).length === 1) {
      if (!admitStart(auth.user.id)) return jsonNoStore({ error: "checkout_rate_limited" }, 429);
      return jsonNoStore(await createSandboxTransaction(config, auth.user.id, body.plan), 201);
    }
    if ("receipt" in body && typeof body.receipt === "string" && Object.keys(body).length === 1) {
      const result = await readSandboxTransaction(config, auth.user.id, body.receipt);
      if (!result) return jsonNoStore({ error: "invalid_receipt" }, 400);
      return jsonNoStore(result);
    }
  } catch {
    return jsonNoStore({ error: "sandbox_provider_unavailable" }, 502);
  }

  return jsonNoStore({ error: "invalid_request" }, 400);
}
