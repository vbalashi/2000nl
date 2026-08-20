import { NextRequest } from "next/server";
import {
  appendPlatformRouteHeaders,
  createPlatformRouteInstrumentation,
  measureRouteTiming,
} from "@/lib/platform/routeInstrumentation";
import {
  getAuthenticatedSupabase,
  getPlatformServiceSupabase,
  jsonNoStore,
  platformCorsPreflight,
  requirePlatformScope,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import { parsePlatformV2ActionReceiptRequest } from "@/lib/platform/platformV2ActionRequest";
import { reconcilePlatformV2ActionReceipt } from "@/lib/platform/platformV2ActionService";
import { platformV2ActionsEnabled } from "@/lib/platform/platformV2Rollout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  const instrumentation = createPlatformRouteInstrumentation(request);
  const reply = (payload: unknown, status = 200) =>
    withPlatformCors(request, jsonNoStore(payload, status));
  const auth = await measureRouteTiming(instrumentation, "route.auth", () =>
    getAuthenticatedSupabase(request, instrumentation),
  );
  if (auth instanceof Response) {
    return appendPlatformRouteHeaders(
      withPlatformCors(request, auth),
      instrumentation,
    );
  }
  const scopeError = requirePlatformScope(auth, "platform:write");
  if (scopeError) {
    return appendPlatformRouteHeaders(
      withPlatformCors(request, scopeError),
      instrumentation,
    );
  }
  if (!platformV2ActionsEnabled()) {
    return appendPlatformRouteHeaders(
      reply({ error: "platform_v2_actions_not_enabled" }, 503),
      instrumentation,
    );
  }

  const parsed = parsePlatformV2ActionReceiptRequest(await readJson(request));
  if (!parsed.ok) {
    return appendPlatformRouteHeaders(
      reply({ error: parsed.error }, parsed.status),
      instrumentation,
    );
  }
  const service = getPlatformServiceSupabase();
  if (service instanceof Response) {
    return appendPlatformRouteHeaders(
      withPlatformCors(request, service),
      instrumentation,
    );
  }

  const result = await measureRouteTiming(
    instrumentation,
    "route.operation",
    () => reconcilePlatformV2ActionReceipt(auth, service, parsed.clientEventId),
  );
  const response = reply(result.payload, result.status);
  const outcome = result.status === 200
    ? "authoritative_receipt"
    : result.status === 404
      ? "receipt_not_found"
      : "failed";
  const actionId = asActionId(result.payload);
  response.headers.set("X-Platform-Review-Outcome", outcome);
  console.info("[platform.training.review]", {
    requestId: instrumentation.requestId,
    clientEventId: parsed.clientEventId,
    actionId,
    attempt: "reconcile",
    outcome,
  });
  return appendPlatformRouteHeaders(response, instrumentation);
}

function asActionId(payload: unknown) {
  if (!payload || typeof payload !== "object") return "unknown";
  const actionId = (payload as { actionId?: unknown }).actionId;
  return typeof actionId === "string" ? actionId : "unknown";
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
