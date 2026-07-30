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
import { performPlatformV2Lookup } from "@/lib/platform/platformV2LookupService";
import { parsePlatformV2LookupRequest } from "@/lib/platform/platformV2LookupRequest";
import { platformV2LookupEnabled } from "@/lib/platform/platformV2Rollout";

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
  const scopeError = requirePlatformScope(auth, "platform:read");
  if (scopeError) {
    return appendPlatformRouteHeaders(
      withPlatformCors(request, scopeError),
      instrumentation,
    );
  }
  if (!platformV2LookupEnabled()) {
    return appendPlatformRouteHeaders(
      reply({ error: "platform_v2_lookup_not_enabled" }, 503),
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

  const body = await readJson(request);
  const parsed = parsePlatformV2LookupRequest(body);
  if (!parsed.ok) {
    return appendPlatformRouteHeaders(
      reply({ error: parsed.error }, 400),
      instrumentation,
    );
  }

  const result = await measureRouteTiming(
    instrumentation,
    "route.operation",
    () =>
      performPlatformV2Lookup(
        { kind: "authenticated", auth, service },
        parsed.request,
      ),
  );
  return appendPlatformRouteHeaders(
    reply(result.payload, result.status),
    instrumentation,
    result.serverTiming,
  );
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
