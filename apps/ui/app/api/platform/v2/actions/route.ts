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
import { parsePlatformV2ActionRequest } from "@/lib/platform/platformV2ActionRequest";
import { performPlatformV2Action } from "@/lib/platform/platformV2ActionService";
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

  const parsed = parsePlatformV2ActionRequest(auth, await readJson(request));
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
    () => performPlatformV2Action(auth, service, parsed.request),
  );
  const response = reply(result.payload, result.status);
  if (parsed.request.actionId === "review-card") {
    const attempt = request.headers.get("x-platform-action-attempt") === "2" ? 2 : 1;
    const error =
      result.payload && typeof result.payload === "object" && "error" in result.payload
        ? String(result.payload.error)
        : null;
    const outcome = error === "state_conflict"
      ? attempt === 2
        ? "newer_remote_state"
        : "stale_state"
      : result.receiptStatus === "duplicate"
        ? attempt === 2
          ? "commit_then_disconnect"
          : "duplicate_retry"
        : result.receiptStatus === "accepted"
          ? attempt === 2
            ? "timeout_before_commit"
            : "accepted"
          : "failed";
    response.headers.set("X-Platform-Review-Outcome", outcome);
    console.info("[platform.training.review]", {
      requestId: instrumentation.requestId,
      clientEventId: parsed.request.clientEventId,
      actionId: parsed.request.actionId,
      cardTypeId: parsed.request.target.cardTypeId,
      attempt,
      outcome,
    });
  }
  return appendPlatformRouteHeaders(
    response,
    instrumentation,
  );
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
