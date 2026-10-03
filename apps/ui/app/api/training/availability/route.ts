import { NextRequest } from "next/server";
import { readBoundedJson } from "@/lib/http/readBoundedJson";
import { getAuthenticatedSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";
import { availabilityRpcScope, parseAvailabilityRecipe, parseTrainingAvailability } from "@/lib/training/availability/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party") return jsonNoStore({ error: "first_party_required" }, 403);
  const parsed = await readBoundedJson(request, 16384);
  if ("error" in parsed) return jsonNoStore({ error: "invalid_training_recipe" }, parsed.error === "too_large" ? 413 : 400);
  const recipe = parseAvailabilityRecipe(parsed.body);
  if (!recipe) return jsonNoStore({ error: "invalid_training_recipe" }, 400);
  try {
    const { data, error } = await auth.supabase.rpc("read_training_recipe_availability_v1", {
      p_user_id: auth.user.id, ...availabilityRpcScope(recipe),
    });
    const result = error ? null : parseTrainingAvailability(data);
    return result ? jsonNoStore(result) : jsonNoStore({ error: "training_availability_unavailable" }, 503);
  } catch { return jsonNoStore({ error: "training_availability_unavailable" }, 503); }
}
