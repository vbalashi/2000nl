import { NextRequest } from "next/server";
import {
  getCatalogSupabase,
  jsonNoStore,
  platformCorsPreflight,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";
import { performPlatformCatalogSearch } from "@/lib/platform/platformApi";
import {
  appendPlatformRouteHeaders,
  createPlatformRouteInstrumentation,
  measureRouteTiming,
} from "@/lib/platform/routeInstrumentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SEARCH_GROUPS = new Set([
  "headwords",
  "examples",
  "definitions",
  "alphabetical",
]);

type CatalogSearchRequestBody = {
  query?: unknown;
  languageCode?: unknown;
  group?: unknown;
  limit?: unknown;
  cursor?: unknown;
};

async function readJson(
  request: NextRequest,
): Promise<CatalogSearchRequestBody | null> {
  try {
    return (await request.json()) as CatalogSearchRequestBody;
  } catch {
    return null;
  }
}

function parseLimit(value: unknown) {
  if (value === undefined || value === null) return 6;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(Math.max(Math.trunc(numeric), 1), 100);
}

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  const instrumentation = createPlatformRouteInstrumentation(request);
  const reply = (payload: unknown, status = 200) =>
    withPlatformCors(request, jsonNoStore(payload, status));

  const service = await measureRouteTiming(instrumentation, "route.auth", () =>
    getCatalogSupabase(request),
  );
  if (service instanceof Response) {
    return appendPlatformRouteHeaders(withPlatformCors(request, service), instrumentation);
  }

  const body = await measureRouteTiming(instrumentation, "route.parse", () =>
    readJson(request),
  );
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const languageCode =
    typeof body?.languageCode === "string" ? body.languageCode.trim() : null;
  const group = typeof body?.group === "string" ? body.group.trim() : null;
  if (group && !SEARCH_GROUPS.has(group)) {
    return reply({ error: "invalid_search_group" }, 400);
  }
  const limit = parseLimit(body?.limit);
  if (limit === null) {
    return reply({ error: "invalid_limit" }, 400);
  }
  const cursor = typeof body?.cursor === "string" ? body.cursor.trim() : null;

  const result = await measureRouteTiming(instrumentation, "route.operation", () =>
    performPlatformCatalogSearch(service, {
      query,
      languageCode,
      group,
      limit,
      cursor,
    }),
  );
  const response = reply(result.payload, result.status);
  return appendPlatformRouteHeaders(response, instrumentation, result.serverTiming);
}
