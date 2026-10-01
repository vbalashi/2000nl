import { NextRequest } from "next/server";
import { getAuthenticatedSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";
import { ACTIVITY_CALENDAR_DAYS, parseActivityCalendar } from "@/lib/training/activity/model";
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
    return jsonNoStore({ error: "invalid_activity_range" }, 400);
  try {
    const { data, error } = await auth.supabase.rpc("get_training_activity_days_v1", { p_language_code: languageCode, p_days: ACTIVITY_CALENDAR_DAYS });
    const calendar = error ? null : parseActivityCalendar(data);
    return calendar ? jsonNoStore(calendar) : jsonNoStore({ error: "activity_unavailable" }, 503);
  } catch { return jsonNoStore({ error: "activity_unavailable" }, 503); }
}
