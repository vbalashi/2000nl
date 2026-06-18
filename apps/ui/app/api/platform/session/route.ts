import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
  platformCorsPreflight,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request: NextRequest) {
  return platformCorsPreflight(request);
}

export async function GET(request: NextRequest) {
  const reply = (payload: unknown, status = 200) =>
    withPlatformCors(request, jsonNoStore(payload, status));

  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) {
    return withPlatformCors(request, auth);
  }

  const { data, error } = await auth.supabase
    .from("user_settings")
    .select("translation_lang, updated_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    return reply(
      { error: "session_preferences_failed", detail: error.message },
      500,
    );
  }

  const translationLang =
    data?.translation_lang === "off" ? null : data?.translation_lang ?? "en";

  return reply({
    user: {
      id: auth.user.id,
      email: auth.user.email ?? null,
    },
    preferences: {
      translationTargetLanguageCode: translationLang,
      updatedAt: data?.updated_at ?? null,
    },
  });
}
