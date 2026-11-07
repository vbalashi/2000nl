import { NextRequest } from "next/server";
import { getAuthenticatedSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";
import { readBoundedJson } from "@/lib/http/readBoundedJson";
import { parseLibraryEntryFilters, parseLibraryMaterialScope, parseLibrarySearchScope } from "@/lib/platform/librarySearchScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party") return jsonNoStore({error:"first_party_required"},403);
  const input = await readBoundedJson(request, 32768);
  if ("error" in input || !input.body || typeof input.body !== "object" || Array.isArray(input.body)) return jsonNoStore({error:"invalid_request"},400);
  const body = input.body as Record<string, unknown>;
  if (Object.keys(body).some(k => !["groups","query","language","dictionaryIds","filters","material","listId","all","category"].includes(k)) ||
    (body.category!=="browse" && body.category!=="headwords") || typeof body.all!=="boolean" || !Array.isArray(body.groups) || (body.all ? body.groups.length>200 : body.groups.length<1 || body.groups.length>200) || body.groups.some(id=>typeof id!=="string" || !uuid.test(id)) ||
    new Set(body.groups.map(id=>id.toLowerCase())).size!==body.groups.length || typeof body.query!=="string" || body.query.length>200 ||
    typeof body.language!=="string" || !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(body.language) ||
    typeof body.listId!=="string" || !uuid.test(body.listId)) return jsonNoStore({error:"invalid_request"},400);
  const scope=parseLibrarySearchScope(body.dictionaryIds), filters=parseLibraryEntryFilters(body.filters), material=parseLibraryMaterialScope(body.material ?? undefined);
  if (!scope || !filters || material===null || (material && scope.dictionaryIds!==null)) return jsonNoStore({error:"invalid_request"},400);
  const {data,error}=await auth.supabase.rpc("prepare_words_bulk_collection_v1",{p_groups:body.groups,p_query:body.query,p_language:body.language,p_dictionaries:scope.dictionaryIds,p_filters:filters,p_material:material ?? null,p_list_id:body.listId,p_all:body.all,p_category:body.category});
  if (error) {
    if (error.code==="40001" || (typeof error.message==="string" && error.message.includes("selection_changed"))) return jsonNoStore({error:"selection_changed"},409);
    if (typeof error.message==="string" && error.message.includes("selection_too_broad")) return jsonNoStore({error:"selection_too_broad"},422);
    return jsonNoStore({error:"bulk_unavailable"},400);
  }
  if (!data || !Number.isSafeInteger(data.articleCount) || !Number.isSafeInteger(data.meaningCount) || typeof data.planId!=="string" || !Array.isArray(data.audience)) return jsonNoStore({error:"bulk_unavailable"},503);
  return jsonNoStore(data);
}

export async function PUT(request: NextRequest) {
  const auth=await getAuthenticatedSupabase(request);
  if(auth instanceof Response)return auth;
  if(auth.principal.authKind!=="first_party")return jsonNoStore({error:"first_party_required"},403);
  const input=await readBoundedJson(request,1024);
  if("error" in input || !input.body || typeof input.body!=="object" || Array.isArray(input.body))return jsonNoStore({error:"invalid_request"},400);
  const body=input.body as Record<string,unknown>;
  if(Object.keys(body).length!==1 || typeof body.planId!=="string" || !uuid.test(body.planId))return jsonNoStore({error:"invalid_request"},400);
  const {data,error}=await auth.supabase.rpc("confirm_words_bulk_collection_v1",{p_plan_id:body.planId});
  if(error)return jsonNoStore({error:error.code==="40001"?"selection_changed":"bulk_unavailable"},error.code==="40001"?409:400);
  if(!data || data.planId!==body.planId || data.status!=="committed" || !Number.isSafeInteger(data.addedCount))return jsonNoStore({error:"bulk_unavailable"},503);
  return jsonNoStore(data);
}
export async function GET(request: NextRequest) {
  const auth=await getAuthenticatedSupabase(request);
  if(auth instanceof Response)return auth;
  if(auth.principal.authKind!=="first_party")return jsonNoStore({error:"first_party_required"},403);
  const id=request.nextUrl.searchParams.get("planId");
  if(!id || !uuid.test(id))return jsonNoStore({error:"invalid_request"},400);
  const {data,error}=await auth.supabase.rpc("read_words_bulk_collection_plan_v1",{p_plan_id:id});
  if(error || !data || data.planId!==id || !["pending","expired","unknown","committed"].includes(data.status))return jsonNoStore({error:"bulk_unavailable"},503);
  return jsonNoStore(data);
}
