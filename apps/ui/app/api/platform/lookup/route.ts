import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  getPlatformServiceSupabase,
  jsonNoStore,
  platformCorsPreflight,
  requirePlatformScope,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import { performPlatformLookup } from "@/lib/platform/platformApi";
import {
  appendPlatformRouteHeaders,
  createPlatformRouteInstrumentation,
  measureRouteTiming,
} from "@/lib/platform/routeInstrumentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

type LookupRequestBody = {
  query?: unknown;
  languageCode?: unknown;
  contextText?: unknown;
  includeUserState?: unknown;
  includeTranslations?: unknown;
  intent?: unknown;
};

async function readJson(request: NextRequest): Promise<LookupRequestBody | null> {
  try {
    return (await request.json()) as LookupRequestBody;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const instrumentation = createPlatformRouteInstrumentation(request);
  const reply = (payload: unknown, status = 200) =>
    withPlatformCors(request, jsonNoStore(payload, status));

  const auth = await measureRouteTiming(instrumentation, "route.auth", () =>
    getAuthenticatedSupabase(request, instrumentation),
  );
  if (auth instanceof Response) {
    return appendPlatformRouteHeaders(withPlatformCors(request, auth), instrumentation);
  }
  const scopeError = requirePlatformScope(auth, "platform:read");
  if (scopeError) {
    return appendPlatformRouteHeaders(withPlatformCors(request, scopeError), instrumentation);
  }

  const body = await measureRouteTiming(instrumentation, "route.parse", () =>
    readJson(request),
  );
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const languageCode =
    typeof body?.languageCode === "string" ? body.languageCode.trim() : null;
  const contextText =
    typeof body?.contextText === "string" ? body.contextText.trim() : null;
  const intent = typeof body?.intent === "string" ? body.intent.trim() : null;
  const includeUserState = body?.includeUserState !== false;
  const includeTranslations = body?.includeTranslations === true;
  const service = includeTranslations
    ? await measureRouteTiming(instrumentation, "route.service", async () =>
        getPlatformServiceSupabase(),
      )
    : null;
  if (service instanceof Response) {
    return appendPlatformRouteHeaders(withPlatformCors(request, service), instrumentation);
  }

  const result = await measureRouteTiming(instrumentation, "route.operation", () =>
    performPlatformLookup(auth, {
      query,
      includeUserState,
      includeTranslations,
      languageCode,
      contextText,
      intent,
      service,
    }),
  );
  const response = reply(result.payload, result.status);
  return appendPlatformRouteHeaders(response, instrumentation, result.serverTiming);
}
