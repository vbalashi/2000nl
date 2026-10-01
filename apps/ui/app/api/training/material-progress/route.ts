import { NextRequest } from "next/server";
import { getAuthenticatedSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";
import { parseMaterialProgress } from "@/lib/training/activity/material";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party") return jsonNoStore({ error: "first_party_required" }, 403);
  const query = request.nextUrl.searchParams;
  const languageCode = query.get("language");
  if (!languageCode || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(languageCode) || [...query.keys()].some(k => k !== "language"))
    return jsonNoStore({ error: "invalid_material_scope" }, 400);
  try {
    const { data, error } = await auth.supabase.rpc("get_training_material_progress_v1", { p_language_code: languageCode });
    const page = error ? null : parseMaterialProgress(data, languageCode);
    if (!page) return jsonNoStore({ error: "material_progress_unavailable" }, 503);
    const curatedIds = page.materials.filter(item => item.kind === "collection" && item.listType === "curated").map(item => item.id!);
    if (curatedIds.length) {
      const catalog = await auth.supabase.from("word_lists").select("id,slug").in("id", curatedIds);
      if (catalog.error) return jsonNoStore({ error: "material_progress_unavailable" }, 503);
      const slugs = new Map((catalog.data ?? []).map(item => [item.id, item.slug]));
      page.materials = page.materials.map(item => item.kind === "collection" && item.listType === "curated" && slugs.has(item.id)
        ? {...item, slug: slugs.get(item.id)} : item);
    }
    return jsonNoStore(page);
  } catch { return jsonNoStore({ error: "material_progress_unavailable" }, 503); }
}
