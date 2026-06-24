import { NextRequest } from "next/server";
import {
  jsonNoStore,
  platformCorsPreflight,
  requirePlatformScope,
  withPlatformCors,
  getAuthenticatedSupabase,
} from "@/lib/platform/serverSupabase";
import { performPlatformSearch } from "@/lib/platform/platformApi";
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

type SearchRequestBody = {
  query?: unknown;
  languageCode?: unknown;
  dictionaryIds?: unknown;
  group?: unknown;
  limit?: unknown;
  cursor?: unknown;
};

async function readJson(request: NextRequest): Promise<SearchRequestBody | null> {
  try {
    return (await request.json()) as SearchRequestBody;
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

function parseDictionaryIds(value: unknown) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return null;
  const ids = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return ids.length ? Array.from(new Set(ids)) : null;
}

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
    performPlatformSearch(auth, {
      query,
      languageCode,
      dictionaryIds: parseDictionaryIds(body?.dictionaryIds),
      group,
      limit,
      cursor,
    }),
  );
  const response = reply(result.payload, result.status);
  return appendPlatformRouteHeaders(response, instrumentation, result.serverTiming);
}
