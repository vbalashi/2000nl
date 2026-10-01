import { NextRequest } from "next/server";
import { getAuthenticatedSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";
import { readBoundedJson } from "@/lib/http/readBoundedJson";
import { MAX_STUDY_TIME_BYTES, parseStudyTimeMeasurement, parseStudyTimePage, parseStudyTimeRange } from "@/lib/training/studyTime/model";
import { readStudyTimePeriod } from "@/lib/training/studyTime/readPeriod";
import type { StudyTimePeriod } from "@/lib/training/studyTime/period";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
async function accountAuth(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  return auth.principal.authKind === "first_party" ? auth : jsonNoStore({ error: "first_party_required" },403);
}
export async function POST(request: NextRequest) {
  const auth = await accountAuth(request);
  if (auth instanceof Response) return auth;
  const parsed = await readBoundedJson(request,MAX_STUDY_TIME_BYTES);
  if ("error" in parsed) return jsonNoStore({ error: "invalid_measurement" }, parsed.error === "too_large" ? 413 : 400);
  const value = parseStudyTimeMeasurement(parsed.body);
  if (!value) return jsonNoStore({ error: "invalid_measurement" },400);
  try {
    const { data,error } = await auth.supabase.rpc("record_training_active_time_v1",{
      p_measurement_id: value.measurementId,p_session_id: value.sessionId,p_family: value.family,p_entry_id: value.entryId,
      p_card_type_id: value.cardTypeId,p_target_id: value.targetId,p_active_ms: value.activeMilliseconds,p_observed_at: value.observedAt,
    });
    if (error) return jsonNoStore({ error: "study_time_unavailable" },503);
    if (data?.error === "measurement_conflict") return jsonNoStore({ error: data.error },409);
    if (data?.error === "measurement_not_owned" || data?.error === "unauthorized") return jsonNoStore({ error: "measurement_not_owned" },403);
    if (["invalid_measurement","measurement_out_of_window"].includes(data?.error)) return jsonNoStore({ error: data.error },400);
    if (data?.accepted !== true || typeof data.duplicate !== "boolean") return jsonNoStore({ error: "study_time_unavailable" },503);
    return jsonNoStore({ accepted: true,duplicate: data.duplicate });
  } catch { return jsonNoStore({ error: "study_time_unavailable" },503); }
}
export async function GET(request: NextRequest) {
  const auth = await accountAuth(request);
  if (auth instanceof Response) return auth;
  const query = request.nextUrl.searchParams;
  if (query.has("period")) {
    const period = query.get("period");
    const languageCode = query.get("language");
    if (!["Today", "Week", "Month"].includes(period ?? "") || [...query.keys()].some(k => !["period", "language"].includes(k))
      || (languageCode !== null && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(languageCode))) return jsonNoStore({ error: "invalid_time_range" }, 400);
    try {
      const page = await readStudyTimePeriod(auth.supabase, period as StudyTimePeriod, languageCode);
      return page ? jsonNoStore(page) : jsonNoStore({ error: "study_time_unavailable" }, 503);
    } catch { return jsonNoStore({ error: "study_time_unavailable" }, 503); }
  }
  const range = parseStudyTimeRange({ startDate: query.get("start"),endDate: query.get("end"),languageCode: query.get("language") });
  if (!range || [...query.keys()].some(k => !["start","end","language"].includes(k))) return jsonNoStore({ error: "invalid_time_range" },400);
  try {
    const { data,error } = await auth.supabase.rpc("get_training_active_time_v1", { p_start_date: range.startDate,p_end_date: range.endDate,p_language_code: range.languageCode });
    const page = error ? null : parseStudyTimePage(data,range);
    return page ? jsonNoStore(page) : jsonNoStore({ error: "study_time_unavailable" },503);
  } catch { return jsonNoStore({ error: "study_time_unavailable" },503); }
}
