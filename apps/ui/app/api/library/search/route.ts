import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  getPlatformServiceSupabase,
  jsonNoStore,
  requirePlatformScope,
} from "@/lib/platform/serverSupabase";
import { readBoundedJson } from "@/lib/http/readBoundedJson";
import { parsePlatformV2LookupRequest } from "@/lib/platform/platformV2LookupRequest";
import { performPlatformV2Lookup } from "@/lib/platform/platformV2LookupService";
import { parseLibraryEntryFilters, parseLibrarySearchScope } from "@/lib/platform/librarySearchScope";
import { platformV2LookupEnabled } from "@/lib/platform/platformV2Rollout";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party")
    return jsonNoStore({ error: "first_party_required" }, 403);
  const scopeError = requirePlatformScope(auth, "platform:read");
  if (scopeError) return scopeError;
  if (!platformV2LookupEnabled())
    return jsonNoStore({ error: "platform_v2_lookup_not_enabled" }, 503);
  const body = await readBoundedJson(request, 16384);
  if ("error" in body)
    return jsonNoStore(
      {
        error:
          body.error === "too_large" ? "request_too_large" : "invalid_request",
      },
      body.error === "too_large" ? 413 : 400,
    );
  const parsed = parsePlatformV2LookupRequest(body.body, { allowLibraryBrowse: true });
  if (!parsed.ok) return jsonNoStore({ error: parsed.error }, 400);
  if (parsed.request.entryId || parsed.request.intent !== "dictionary-lookup")
    return jsonNoStore({ error: "library_query_required" }, 400);
  const dictionaryIds =
    body.body && typeof body.body === "object"
      ? (body.body as Record<string, unknown>).dictionaryIds
      : undefined;
  const scope = parseLibrarySearchScope(dictionaryIds);
  if (!scope) return jsonNoStore({ error: "invalid_dictionary_scope" }, 400);
  const filters = parseLibraryEntryFilters(
    body.body && typeof body.body === "object"
      ? (body.body as Record<string, unknown>).filters : undefined,
  );
  if (filters === null) return jsonNoStore({ error: "invalid_library_filters" }, 400);
  if (filters !== undefined) scope.filters = filters;
  const service = getPlatformServiceSupabase();
  if (service instanceof Response) return service;
  const result = await performPlatformV2Lookup(
    { kind: "authenticated", auth, service },
    parsed.request,
    scope,
  );
  const response = jsonNoStore(result.payload, result.status);
  if (result.serverTiming) response.headers.set("Server-Timing", result.serverTiming);
  return response;
}
