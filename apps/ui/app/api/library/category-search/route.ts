import { NextRequest } from "next/server";
import { readBoundedJson } from "@/lib/http/readBoundedJson";
import { getAuthenticatedSupabase, getPlatformServiceSupabase, jsonNoStore, requirePlatformScope } from "@/lib/platform/serverSupabase";
import { parseLibraryEntryFilters, parseLibraryMaterialScope, parseLibrarySearchScope } from "@/lib/platform/librarySearchScope";
import { platformV2LookupEnabled } from "@/lib/platform/platformV2Rollout";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
const categories = new Set(["headwords", "examples", "definitions", "alphabetical"]);
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party") return jsonNoStore({error:"first_party_required"},403);
  const denied = requirePlatformScope(auth,"platform:read");
  if (denied) return denied;
  if (!platformV2LookupEnabled()) return jsonNoStore({error:"platform_v2_lookup_not_enabled"},503);
  const parsed = await readBoundedJson(request,16384);
  if ("error" in parsed) return jsonNoStore({error:parsed.error === "too_large" ? "request_too_large" : "invalid_request"},parsed.error === "too_large" ? 413 : 400);
  const body = parsed.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonNoStore({error:"invalid_request"},400);
  const input = body as Record<string, unknown>;
  const query = typeof input.query === "string" ? input.query.trim() : "";
  const languageCode = typeof input.languageCode === "string" ? input.languageCode.trim() : null;
  const group = typeof input.group === "string" ? input.group : "";
  if (!query || query.length>200 || !categories.has(group) || (languageCode !== null && !/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(languageCode))) return jsonNoStore({error:"invalid_query"},400);
  const scope = parseLibrarySearchScope(input.dictionaryIds);
  const filters = parseLibraryEntryFilters(input.filters);
  const material = parseLibraryMaterialScope(input.material);
  if (!scope || filters === null || material === null || (material !== undefined && scope.dictionaryIds !== null)) return jsonNoStore({error:"invalid_library_scope"},400);
  if (input.cursor !== undefined && input.cursor !== null && (typeof input.cursor !== "string" || input.cursor.length>4096)) return jsonNoStore({error:"invalid_cursor"},400);
  if (input.limit !== undefined && (typeof input.limit !== "number" || !Number.isInteger(input.limit) || input.limit<1 || input.limit>100)) return jsonNoStore({error:"invalid_limit"},400);
  const service = getPlatformServiceSupabase();
  if (service instanceof Response) return service;
  const operation = service.supabase.rpc("search_library_category_v1",{
    p_user_id:auth.principal.userId,p_query:query,p_language_code:languageCode,
    p_dictionary_ids:scope.dictionaryIds,p_filters:filters ?? {parts:[],article:null},p_material:material ?? null,
    p_group:group,p_limit:input.limit ?? 100,p_cursor:input.cursor ?? null,
  });
  const {data,error} = await operation.abortSignal(request.signal);
  if (error) return jsonNoStore({error:"library_search_failed"},500);
  if (data?.error) return jsonNoStore(data,data.error === "material_not_accessible" ? 404 : data.error === "search_index_not_ready" ? 503 : 400);
  return jsonNoStore(data);
}
