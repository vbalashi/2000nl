import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
} from "@/lib/platform/serverSupabase";
import { readBoundedJson } from "@/lib/http/readBoundedJson";
import { createMaterialPreferencesRepository } from "@/lib/training/material/repository";
import {
  MAX_MATERIAL_PREFERENCES_BYTES,
  parseMaterialPreferences,
} from "@/lib/training/material/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
async function accountAuth(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  return auth.principal.authKind === "first_party"
    ? auth
    : jsonNoStore({ error: "first_party_required" }, 403);
}
export async function GET(request: NextRequest) {
  const auth = await accountAuth(request);
  if (auth instanceof Response) return auth;
  try {
    return jsonNoStore(
      await createMaterialPreferencesRepository(auth.supabase).load(
        auth.user.id,
      ),
    );
  } catch {
    return jsonNoStore({ error: "material_preferences_unavailable" }, 503);
  }
}
export async function PUT(request: NextRequest) {
  const auth = await accountAuth(request);
  if (auth instanceof Response) return auth;
  const parsed = await readBoundedJson(request, MAX_MATERIAL_PREFERENCES_BYTES);
  if ("error" in parsed)
    return jsonNoStore(
      {
        error:
          parsed.error === "too_large"
            ? "material_preferences_too_large"
            : "invalid_material_preferences",
      },
      parsed.error === "too_large" ? 413 : 400,
    );
  const body = parsed.body;
  if (body === null || typeof body !== "object" || Array.isArray(body))
    return jsonNoStore({ error: "invalid_material_preferences" }, 400);
  const input = body as Record<string, unknown>;
  const document = parseMaterialPreferences(input.document);
  const revision = input.expectedRevision;
  if (
    !document ||
    typeof revision !== "number" ||
    !Number.isInteger(revision) ||
    revision < 0 ||
    revision >= 2147483647
  )
    return jsonNoStore({ error: "invalid_material_preferences" }, 400);
  try {
    const result = await createMaterialPreferencesRepository(
      auth.supabase,
    ).save(revision, document);
    return result.kind === "conflict"
      ? jsonNoStore(
          { error: "material_preferences_conflict", snapshot: result.snapshot },
          409,
        )
      : jsonNoStore(result.snapshot);
  } catch {
    return jsonNoStore({ error: "material_preferences_unavailable" }, 503);
  }
}
